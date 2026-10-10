"""
FLINT Edge Tracker & Multi-Frame Persistence Engine
Integrates ByteTrack persistent IDs and gates event dispatch until an object
is verified across consecutive frames (N >= 3) to eliminate transient noise and shadows.
"""

import time
import logging
from typing import List, Dict, Any, Tuple, Optional
import numpy as np

logger = logging.getLogger("flint.edge.tracker")

class TrackedObject:
    """Represents a persistent tracked road entity (defect, vehicle, or pedestrian)."""

    def __init__(
        self,
        track_id: int,
        class_id: int,
        class_name: str,
        category: str,
        bbox: List[int],
        confidence: float,
        timestamp: float,
        crop: Optional[np.ndarray] = None,
    ):
        self.track_id = track_id
        self.class_id = class_id
        self.class_name = class_name
        self.category = category
        self.bbox = bbox
        self.confidence = confidence
        self.first_seen_time = timestamp
        self.last_seen_time = timestamp

        self.consecutive_hits: int = 1
        self.total_hits: int = 1
        self.misses: int = 0
        self.is_confirmed: bool = False
        self.alert_emitted: bool = False

        # Trajectory history for velocity and expansion (TTC) calculations
        self.history: List[Tuple[float, List[int]]] = [(timestamp, bbox)]
        self.best_confidence: float = confidence
        self.best_crop: Optional[np.ndarray] = crop

    def update(
        self,
        bbox: List[int],
        confidence: float,
        timestamp: float,
        crop: Optional[np.ndarray] = None,
    ) -> None:
        """Update track with a new frame detection."""
        self.bbox = bbox
        self.confidence = confidence
        self.last_seen_time = timestamp
        self.consecutive_hits += 1
        self.total_hits += 1
        self.misses = 0

        self.history.append((timestamp, bbox))
        if len(self.history) > 30:
            self.history.pop(0)

        # Retain best evidence crop
        if confidence > self.best_confidence and crop is not None and crop.size > 0:
            self.best_confidence = confidence
            self.best_crop = crop

    def mark_missed(self) -> None:
        """Increment miss counter when track is not observed in current frame."""
        self.misses += 1
        self.consecutive_hits = 0

    def compute_ttc(self) -> Optional[float]:
        """
        Calculates Time-to-Collision (TTC) for obstacles / pedestrians
        using relative rate of vertical bounding box height growth:
        TTC = h(t) * dt / (h(t) - h(t-1))
        """
        if len(self.history) < 2:
            return None

        t_curr, bbox_curr = self.history[-1]
        t_prev, bbox_prev = self.history[-2]

        dt = t_curr - t_prev
        if dt <= 0:
            return None

        h_curr = bbox_curr[3] - bbox_curr[1]
        h_prev = bbox_prev[3] - bbox_prev[1]
        dh = h_curr - h_prev

        if dh <= 0:
            # Object is not growing in scale (not approaching)
            return None

        ttc = (h_curr * dt) / dh
        return round(float(ttc), 2)


def compute_iou(boxA: List[int], boxB: List[int]) -> float:
    """Compute Intersection-over-Union between two bounding boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
    return float(iou)


class EdgeTracker:
    """
    Manages persistent tracks across consecutive frames and applies
    Multi-Frame Persistence Filtering for road defects and continuous tracking
    for traffic density and safety analytics.
    """

    def __init__(
        self,
        min_persistence_frames: int = 3,
        max_staleness_frames: int = 10,
        low_congestion_thresh: int = 3,
        moderate_congestion_thresh: int = 7,
    ):
        self.min_persistence = min_persistence_frames
        self.max_staleness = max_staleness_frames
        self.low_thresh = low_congestion_thresh
        self.mod_thresh = moderate_congestion_thresh

        self.tracks: Dict[int, TrackedObject] = {}
        self.next_auto_id: int = 1
        self.seen_vehicle_ids: set = set()

    def _find_spatial_match(self, det: Dict[str, Any]) -> Optional[int]:
        """Find an existing active track that spatially matches the detection."""
        best_tid = None
        best_score = 0.0

        det_bbox = det["bbox"]
        det_cx, det_cy = det["center"]

        for tid, track in self.tracks.items():
            # Category compatibility (do not match a defect to a vehicle)
            if track.category != det["category"]:
                continue

            iou = compute_iou(track.bbox, det_bbox)
            tcx, tcy = (track.bbox[0] + track.bbox[2]) // 2, (track.bbox[1] + track.bbox[3]) // 2
            dist = np.hypot(det_cx - tcx, det_cy - tcy)

            # Match if IoU >= 0.15 or center within 90 pixels (moving down the road)
            if iou >= 0.15:
                score = iou
            elif dist < 90 and det_cy >= tcy - 10:
                score = 1.0 - (dist / 120.0)
            else:
                score = 0.0

            if score > best_score and score > 0.20:
                best_score = score
                best_tid = tid

        return best_tid

    def update(
        self,
        detections: List[Dict[str, Any]],
        timestamp: float,
    ) -> Tuple[List[TrackedObject], List[TrackedObject]]:
        """
        Updates tracking state from current frame detections.
        Returns:
            active_tracks: List of all currently tracked objects.
            newly_confirmed: List of road defect objects that JUST crossed the persistence threshold.
        """
        matched_track_ids = set()
        newly_confirmed: List[TrackedObject] = []

        for det in detections:
            track_id = det.get("track_id")
            category = det.get("category", "ROAD_DEFECT")

            # Spatial matching fallback for low-confidence defect detections
            if track_id is None:
                track_id = self._find_spatial_match(det)
                if track_id is None:
                    track_id = self.next_auto_id
                    self.next_auto_id += 1
                det["track_id"] = track_id

            matched_track_ids.add(track_id)

            if track_id in self.tracks:
                # Update existing track
                track = self.tracks[track_id]
                track.update(
                    bbox=det["bbox"],
                    confidence=det["confidence"],
                    timestamp=timestamp,
                    crop=det.get("crop"),
                )
            else:
                # Register new track
                track = TrackedObject(
                    track_id=track_id,
                    class_id=det["class_id"],
                    class_name=det["class_name"],
                    category=category,
                    bbox=det["bbox"],
                    confidence=det["confidence"],
                    timestamp=timestamp,
                    crop=det.get("crop"),
                )
                self.tracks[track_id] = track

            # Record vehicle IDs for cumulative traffic counting
            if category == "TRAFFIC":
                self.seen_vehicle_ids.add(track_id)
                track.is_confirmed = True

            # Check persistence filter for road surface defects (eliminate single-frame noise)
            elif category in ("ROAD_DEFECT", "ROAD_BLOCKAGE"):
                if not track.is_confirmed and (track.consecutive_hits >= self.min_persistence or track.total_hits >= max(2, self.min_persistence)):
                    track.is_confirmed = True
                    newly_confirmed.append(track)
                    logger.info(
                        f"🚨 Defect #{track.track_id} [{track.class_name.upper()}] "
                        f"CONFIRMED by persistence filter ({track.consecutive_hits}/{self.min_persistence} frames)"
                    )

        # Mark missed tracks and prune stale ones
        stale_ids = []
        for tid, track in self.tracks.items():
            if tid not in matched_track_ids:
                track.mark_missed()
                if track.misses >= self.max_staleness:
                    stale_ids.append(tid)

        for tid in stale_ids:
            del self.tracks[tid]

        active_tracks = list(self.tracks.values())
        return active_tracks, newly_confirmed

    def get_traffic_stats(self) -> Dict[str, Any]:
        """
        Calculates real-time traffic congestion metrics, active vehicle counts,
        cumulative vehicles seen, and collision risk warnings.
        """
        active_vehicles = [
            t for t in self.tracks.values() if t.category == "TRAFFIC" and t.misses == 0
        ]
        active_pedestrians = [
            t for t in self.tracks.values() if t.category == "SAFETY" and t.misses == 0
        ]

        active_v_count = len(active_vehicles)

        if active_v_count < self.low_thresh:
            congestion_level = "LOW"
        elif active_v_count < self.mod_thresh:
            congestion_level = "MODERATE"
        else:
            congestion_level = "HEAVY"

        # Check for critical Time-To-Collision (TTC < 2.5s)
        hazard_alerts = []
        for p in active_pedestrians + active_vehicles:
            ttc = p.compute_ttc()
            if ttc is not None and ttc < 2.5:
                hazard_alerts.append({
                    "track_id": p.track_id,
                    "class_name": p.class_name,
                    "category": p.category,
                    "ttc_sec": ttc,
                })

        return {
            "active_vehicles": active_v_count,
            "active_pedestrians": len(active_pedestrians),
            "cumulative_vehicles": len(self.seen_vehicle_ids),
            "congestion_level": congestion_level,
            "hazard_alerts": hazard_alerts,
        }

    def get_track(self, track_id: int) -> Optional[TrackedObject]:
        """Retrieve a tracked object by ID."""
        return self.tracks.get(track_id)

