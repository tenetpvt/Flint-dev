"""
FLINT Edge Detector Engine
YOLOv8 inference wrapper with Ground ROI Polygon Masking.
"""

import os
import cv2
import logging
from typing import List, Dict, Any, Optional
import numpy as np

logger = logging.getLogger("flint.edge.detector")

# Category mapping to match FLINT Central Platform schemas
CLASS_TO_CATEGORY: Dict[str, str] = {
    "person": "SAFETY",
    "bicycle": "SAFETY",
    "car": "TRAFFIC",
    "motorcycle": "TRAFFIC",
    "bus": "TRAFFIC",
    "truck": "TRAFFIC",
    # RDD2022 Road damage defect classes
    "pothole": "ROAD_DEFECT",
    "alligator crack": "ROAD_DEFECT",
    "transverse crack": "ROAD_DEFECT",
    "longitudinal crack": "ROAD_DEFECT",
    "other corruption": "ROAD_DEFECT",
    "crack": "ROAD_DEFECT",
    "manhole": "ROAD_DEFECT",
    "blockage": "ROAD_BLOCKAGE",
}

class EdgeDetector:
    """
    Dual-Head YOLOv8 inference wrapper equipped with Ground ROI polygon masking
    for road surface defects and forward scene scanning for traffic/safety tracking.
    """

    def __init__(
        self,
        defect_model_path: str = "edge/models/rdd2022_yolov8.pt",
        defect_conf: float = 0.18,
        defect_iou: float = 0.45,
        defect_imgsz: int = 960,
        defect_target_classes: Optional[List[int]] = None,
        roi_horizon_ratio: float = 0.40,
        enable_traffic: bool = True,
        traffic_model_path: str = "yolov8n.pt",
        traffic_conf: float = 0.35,
        traffic_iou: float = 0.45,
        traffic_imgsz: int = 640,
        traffic_target_classes: Optional[List[int]] = None,
        enable_tracking: bool = True,
        tracker_type: str = "bytetrack.yaml",
        device: Optional[Any] = None,
        # Legacy backward-compatibility parameters
        model_path: Optional[str] = None,
        confidence_threshold: Optional[float] = None,
        target_classes: Optional[List[int]] = None,
        imgsz: Optional[int] = None,
    ):
        # Allow legacy positional/keyword overrides
        if model_path is not None:
            defect_model_path = model_path
        if confidence_threshold is not None:
            defect_conf = confidence_threshold
        if target_classes is not None:
            defect_target_classes = target_classes
        if imgsz is not None:
            defect_imgsz = imgsz

        self.defect_model_path = defect_model_path
        self.defect_conf = defect_conf
        self.defect_iou = defect_iou
        self.defect_imgsz = defect_imgsz
        self.defect_target_classes = defect_target_classes
        self.horizon_ratio = roi_horizon_ratio

        self.enable_traffic = enable_traffic
        self.traffic_model_path = traffic_model_path
        self.traffic_conf = traffic_conf
        self.traffic_iou = traffic_iou
        self.traffic_imgsz = traffic_imgsz
        self.traffic_target_classes = traffic_target_classes or [0, 1, 2, 3, 5, 7]

        self.enable_tracking = enable_tracking
        self.tracker_type = tracker_type

        # Device auto-fallback guard
        import torch
        if device not in ("cpu", None) and not torch.cuda.is_available():
            logger.warning(
                f"CUDA device '{device}' requested but torch.cuda.is_available() is False. "
                "Falling back to CPU. (Install PyTorch CUDA build to enable RTX 3050)."
            )
            self.device = "cpu"
        else:
            self.device = device

        self.defect_model = None
        self.traffic_model = None
        self._load_models()

    def _load_models(self) -> None:
        """Load YOLO models via ultralytics."""
        from ultralytics import YOLO

        target_dev = f" (device={self.device})" if self.device is not None else " (auto-device)"

        # 1. Road Defect Model (RDD2022)
        try:
            if self.defect_model_path and os.path.exists(self.defect_model_path):
                logger.info(f"Loading Road Defect model from '{self.defect_model_path}'{target_dev}...")
                self.defect_model = YOLO(self.defect_model_path)
                logger.info("Road Defect model loaded successfully.")
            else:
                logger.warning(
                    f"Road defect model path '{self.defect_model_path}' not found. Defect inference disabled."
                )
        except Exception as e:
            logger.error(f"Failed to load Road Defect model: {e}")

        # 2. Traffic & Pedestrian Model (COCO / IDD)
        if self.enable_traffic:
            try:
                logger.info(f"Loading Traffic model from '{self.traffic_model_path}'{target_dev}...")
                self.traffic_model = YOLO(self.traffic_model_path)
                logger.info("Traffic & Vehicle model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Traffic model: {e}")

    def apply_ground_roi_mask(self, frame: np.ndarray) -> np.ndarray:
        """
        Applies a binary polygon mask zeroing out the upper horizon (sky, trees, horizon).
        Eliminates overhead false triggers on road surface defect scans.
        """
        h, w = frame.shape[:2]
        horizon_y = int(h * self.horizon_ratio)
        masked_frame = frame.copy()
        masked_frame[0:horizon_y, :] = 0
        return masked_frame

    def detect(self, frame: np.ndarray, apply_roi: bool = True) -> List[Dict[str, Any]]:
        """
        Runs dual-head inference:
        1. Defect Head: Runs on Ground ROI masked frame for road surface distress.
        2. Traffic Head: Runs on forward scene for vehicles and pedestrians.
        Returns a unified list of detections with namespaced track IDs.
        """
        h, w = frame.shape[:2]
        horizon_y = int(h * self.horizon_ratio)
        detections: List[Dict[str, Any]] = []

        # =========================================================================
        # 1. ROAD DEFECT INFERENCE (RDD2022 Head)
        # =========================================================================
        if self.defect_model is not None:
            input_frame = self.apply_ground_roi_mask(frame) if apply_roi else frame
            try:
                if self.enable_tracking:
                    results = self.defect_model.track(
                        source=input_frame,
                        conf=self.defect_conf,
                        iou=self.defect_iou,
                        classes=self.defect_target_classes,
                        persist=True,
                        tracker=self.tracker_type,
                        imgsz=self.defect_imgsz,
                        device=self.device,
                        verbose=False,
                    )
                else:
                    results = self.defect_model.predict(
                        source=input_frame,
                        conf=self.defect_conf,
                        iou=self.defect_iou,
                        classes=self.defect_target_classes,
                        imgsz=self.defect_imgsz,
                        device=self.device,
                        verbose=False,
                    )

                for result in results:
                    boxes = result.boxes
                    if boxes is None:
                        continue
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        conf_score = float(box.conf[0].cpu().numpy())
                        cls_id = int(box.cls[0].cpu().numpy())
                        cls_name = result.names.get(cls_id, f"defect_{cls_id}").lower()
                        if cls_name in ("0", "defect_0", "potholes"):
                            cls_name = "pothole"
                        track_id = int(box.id[0].cpu().numpy()) if (box.id is not None) else None

                        # Must be below horizon line
                        if y2 <= horizon_y:
                            continue

                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        crop = frame[y1:y2, x1:x2].copy() if (x2 > x1 and y2 > y1) else None
                        category = CLASS_TO_CATEGORY.get(cls_name, "ROAD_DEFECT")

                        detections.append({
                            "track_id": track_id,
                            "head": "DEFECT",
                            "bbox": [x1, y1, x2, y2],
                            "confidence": round(conf_score, 3),
                            "class_id": cls_id,
                            "class_name": cls_name,
                            "category": category,
                            "crop": crop,
                            "center": ((x1 + x2) // 2, (y1 + y2) // 2),
                        })
            except Exception as e:
                logger.error(f"Defect inference error: {e}")

        # =========================================================================
        # 2. TRAFFIC & VEHICLE INFERENCE (COCO / IDD Head)
        # =========================================================================
        if self.enable_traffic and self.traffic_model is not None:
            # Mask out top 15% (clouds/sky) while keeping forward horizon for vehicles
            sky_y = int(h * 0.15)
            traffic_input = frame.copy()
            traffic_input[0:sky_y, :] = 0

            try:
                if self.enable_tracking:
                    results = self.traffic_model.track(
                        source=traffic_input,
                        conf=self.traffic_conf,
                        iou=self.traffic_iou,
                        classes=self.traffic_target_classes,
                        persist=True,
                        tracker=self.tracker_type,
                        imgsz=self.traffic_imgsz,
                        device=self.device,
                        verbose=False,
                    )
                else:
                    results = self.traffic_model.predict(
                        source=traffic_input,
                        conf=self.traffic_conf,
                        iou=self.traffic_iou,
                        classes=self.traffic_target_classes,
                        imgsz=self.traffic_imgsz,
                        device=self.device,
                        verbose=False,
                    )


                for result in results:
                    boxes = result.boxes
                    if boxes is None:
                        continue
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        conf_score = float(box.conf[0].cpu().numpy())
                        cls_id = int(box.cls[0].cpu().numpy())
                        cls_name = result.names.get(cls_id, f"vehicle_{cls_id}").lower()

                        # Offset traffic track IDs (+10,000) so they never conflict with defect IDs
                        raw_track_id = int(box.id[0].cpu().numpy()) if (box.id is not None) else None
                        track_id = (raw_track_id + 10000) if raw_track_id is not None else None

                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        crop = frame[y1:y2, x1:x2].copy() if (x2 > x1 and y2 > y1) else None
                        category = CLASS_TO_CATEGORY.get(cls_name, "TRAFFIC")

                        detections.append({
                            "track_id": track_id,
                            "head": "TRAFFIC",
                            "bbox": [x1, y1, x2, y2],
                            "confidence": round(conf_score, 3),
                            "class_id": cls_id,
                            "class_name": cls_name,
                            "category": category,
                            "crop": crop,
                            "center": ((x1 + x2) // 2, (y1 + y2) // 2),
                        })
            except Exception as e:
                logger.error(f"Traffic inference error: {e}")

        return detections

    def annotate(
        self,
        frame: np.ndarray,
        detections: List[Dict[str, Any]],
        show_roi: bool = True,
    ) -> np.ndarray:
        """
        Draws bounding boxes, category tags, confidence scores, and Ground ROI horizon overlay.
        """
        vis_frame = frame.copy()
        h, w = vis_frame.shape[:2]
        horizon_y = int(h * self.horizon_ratio)

        # Draw Ground ROI Horizon demarcation line (defects evaluated below this line)
        if show_roi:
            cv2.line(vis_frame, (0, horizon_y), (w, horizon_y), (0, 165, 255), 2)
            cv2.putText(
                vis_frame,
                f"GROUND ROI HORIZON (Defects: Lower {int((1 - self.horizon_ratio) * 100)}%)",
                (20, max(25, horizon_y - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.50,
                (0, 165, 255),
                2,
            )

        # Distinct color palette per category
        colors = {
            "ROAD_DEFECT": (0, 0, 255),       # Red: potholes and cracks
            "ROAD_BLOCKAGE": (0, 140, 255),   # Orange: blockages
            "TRAFFIC": (0, 230, 255),         # Yellow / Cyan: cars, buses, trucks
            "SAFETY": (255, 0, 230),          # Magenta: pedestrians, bicycles
        }

        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cls_name = det["class_name"].upper()
            conf = det["confidence"]
            cat = det["category"]
            color = colors.get(cat, (0, 255, 0))

            # Bounding box
            thickness = 2 if cat != "ROAD_DEFECT" else 3
            cv2.rectangle(vis_frame, (x1, y1), (x2, y2), color, thickness)

            # Label badge with Track ID and persistence status
            track_id = det.get("track_id")
            if track_id is not None:
                # Format friendly display ID: V101 for vehicles, #12 for defects
                if track_id >= 10000:
                    id_badge = f"#V{track_id - 10000} "
                else:
                    id_badge = f"#{track_id} "
            else:
                id_badge = ""

            persist_info = f" ({det['consecutive_hits']}/{det['min_persistence']})" if "consecutive_hits" in det else ""
            status_suffix = " [VERIFIED]" if det.get("is_confirmed") else ""
            label = f"{id_badge}{cls_name} {conf:.2f}{persist_info}{status_suffix}"

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(vis_frame, (x1, max(0, y1 - lh - 8)), (x1 + lw + 8, y1), color, -1)
            cv2.putText(
                vis_frame,
                label,
                (x1 + 4, max(lh + 2, y1 - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )

        return vis_frame
