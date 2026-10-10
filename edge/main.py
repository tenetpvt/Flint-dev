"""
FLINT Onboard Edge AI Engine — Main CLI Orchestrator
Connects Camera Ingestion -> Ground ROI Masking -> YOLO Inference -> Visualizer / Evidence Dispatcher.
"""

import os
import sys
import time
import argparse
import logging
import yaml
import cv2
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("flint.edge.main")

# Ensure edge module path is resolvable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.camera import CameraStream
from src.detector import EdgeDetector
from src.tracker import EdgeTracker
from src.optical_flow import OpticalFlowVerifier
from src.dispatcher import TelemetryDispatcher
from src.telemetry_source import (
    TelemetrySource,
    LinearRouteSource,
    GpxSrtFileSource,
    LiveSerialSource,
    auto_detect_gps_file
)

def load_config(config_path: str) -> Dict[str, Any]:
    """Load configuration from YAML file."""
    if not os.path.exists(config_path):
        logger.warning(f"Config file '{config_path}' not found. Using built-in defaults.")
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def main() -> None:
    parser = argparse.ArgumentParser(description="FLINT Onboard Edge AI Engine (Dual-Head)")
    parser.add_argument("--config", default="edge/config.yaml", help="Path to YAML config")
    parser.add_argument("--video", default=None, help="Override video input source path or RTSP URL")
    parser.add_argument("--conf", type=float, default=None, help="Override detection confidence threshold")
    parser.add_argument("--sample-fps", type=int, default=None, help="Override sampling FPS rate")
    parser.add_argument("--imgsz", type=int, default=None, help="Override inference resolution (e.g. 960)")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode without GUI window")
    parser.add_argument("--max-frames", type=int, default=None, help="Stop after N sampled frames (for testing)")
    parser.add_argument("--save-evidence", action="store_true", help="Save detected object crops to disk")
    parser.add_argument("--no-backend", action="store_true", help="Disable telemetry dispatch to central backend")
    parser.add_argument("--device", default=None, help="Compute device for inference: 0 for NVIDIA GPU, 'cpu' for CPU fallback")
    parser.add_argument("--gps", default=None, help="Path to companion .gpx, .srt, or .csv GPS log (Mode 3: Field Survey)")
    parser.add_argument("--route", default=None, help="Assigned transit route name for linear referencing (Mode 2, e.g. R3)")
    parser.add_argument("--live-gps", default=None, help="Serial port for AIS-140 hardware GPS stream (Mode 1, e.g. COM3)")
    parser.add_argument("--realtime", action="store_true", default=True, help="Enforce 1.0x real-world video playback speed (default: True)")
    parser.add_argument("--fast", "--benchmark", action="store_false", dest="realtime", help="Run at uncapped GPU throughput without real-time throttling")
    args = parser.parse_args()

    cfg = load_config(args.config)

    # Device & Ingestion parameters
    device_cfg = cfg.get("device", {})
    bus_id = device_cfg.get("bus_id", "BUS-03")
    route_id = device_cfg.get("route_id", "R3")
    default_gps = device_cfg.get("gps_default", {"lat": 21.2415, "lon": 81.6335})
    cur_lat, cur_lon = default_gps.get("lat", 21.2415), default_gps.get("lon", 81.6335)

    camera_cfg = cfg.get("camera", {})
    video_source = args.video or camera_cfg.get("source", "edge/sample_drive.mp4")
    sample_fps = args.sample_fps or camera_cfg.get("sample_fps", 10)
    loop_video = camera_cfg.get("loop", True)

    # Multi-Source Telemetry Source Configuration (Mode 1, 2, or 3)
    target_route = args.route or route_id or "R3"
    detected_gps_file = args.gps or auto_detect_gps_file(video_source)

    if args.live_gps:
        telemetry_source: TelemetrySource = LiveSerialSource(port=args.live_gps)
    elif detected_gps_file:
        telemetry_source = GpxSrtFileSource(file_path=detected_gps_file)
    else:
        telemetry_source = LinearRouteSource(route_name=target_route)

    roi_cfg = cfg.get("roi", {})
    horizon_ratio = roi_cfg.get("horizon_ratio", 0.40)

    # Dual-Head Detection settings
    det_cfg = cfg.get("detection", {})
    defect_cfg = det_cfg.get("defect", {})
    traffic_cfg = det_cfg.get("traffic", {})

    target_device = args.device if args.device is not None else det_cfg.get("device", 0)

    # Fallback to single detection block if old config structure
    defect_model_path = defect_cfg.get("model_path") or det_cfg.get("model_path", "edge/models/rdd2022_yolov8.pt")
    defect_conf = args.conf if args.conf is not None else defect_cfg.get("confidence_threshold", 0.38)
    defect_iou = defect_cfg.get("iou_threshold", 0.45)
    defect_imgsz = args.imgsz or defect_cfg.get("imgsz", 960)
    defect_classes = defect_cfg.get("target_classes", None)

    enable_traffic = traffic_cfg.get("enabled", True)
    traffic_model_path = traffic_cfg.get("model_path", "yolov8n.pt")
    traffic_conf = traffic_cfg.get("confidence_threshold", 0.35)
    traffic_iou = traffic_cfg.get("iou_threshold", 0.45)
    traffic_imgsz = traffic_cfg.get("imgsz", 640)
    traffic_classes = traffic_cfg.get("target_classes", [0, 1, 2, 3, 5, 7])

    # Tracking settings
    track_cfg = cfg.get("tracking", {})
    enable_tracking = track_cfg.get("enabled", True)
    tracker_type = track_cfg.get("tracker_type", "bytetrack.yaml")
    min_persistence = track_cfg.get("min_persistence_frames", 3)
    max_staleness = track_cfg.get("max_staleness_frames", 10)

    congestion_cfg = cfg.get("congestion", {})
    low_thresh = congestion_cfg.get("low_threshold", 3)
    mod_thresh = congestion_cfg.get("moderate_threshold", 7)

    # Optical flow
    flow_cfg = cfg.get("optical_flow", {})
    enable_optical_flow = flow_cfg.get("enabled", True)
    flow_delta_sec = flow_cfg.get("frame_delta_sec", 0.50)
    flow_variance_thresh = flow_cfg.get("variance_threshold", 14.0)

    # Central Backend Ingestion
    backend_cfg = cfg.get("backend", {})
    enable_backend = (not args.no_backend) and backend_cfg.get("enabled", True)
    backend_url = backend_cfg.get("api_url", "http://localhost:8000/api/ingest/detection")
    journey_id = backend_cfg.get("journey_id", 1)
    timeout_sec = backend_cfg.get("timeout_seconds", 3)
    save_evidence = args.save_evidence or backend_cfg.get("save_evidence", True)
    evidence_dir = backend_cfg.get("evidence_dir", "edge/evidence_crops")

    dev_label = f"NVIDIA GPU (CUDA device {target_device})" if str(target_device) not in ("cpu", "-1") else "CPU (Fallback)"
    logger.info("=" * 65)
    logger.info(f"FLINT Edge AI Dual-Head Engine Initializing on [{bus_id} / {route_id}]")
    logger.info(f"Hardware Compute:   {dev_label}")
    logger.info(f"Telemetry Mode:     {telemetry_source.get_mode_name()}")
    logger.info(f"Video Source:       {video_source}")
    logger.info(f"Target Sampling:    {sample_fps} FPS (Loop: {loop_video})")
    logger.info(f"Ground ROI Horizon: Top {int(horizon_ratio * 100)}% masked for defect scans")
    logger.info(f"Defect Specialist:  {defect_model_path} @ {defect_imgsz}p (Conf: {defect_conf})")
    logger.info(f"Traffic Specialist: {traffic_model_path} @ {traffic_imgsz}p (Conf: {traffic_conf})")
    logger.info(f"ByteTrack Filter:   Enabled={enable_tracking} (Min Persistence: {min_persistence} frames)")
    logger.info(f"Central Dispatch:   Enabled={enable_backend} -> {backend_url} (Journey #{journey_id})")
    logger.info(f"Headless Mode:      {args.headless}")
    logger.info("=" * 65)

    # Check input video existence
    if not os.path.exists(video_source) and not str(video_source).startswith(("rtsp://", "http://")):
        if "sample_drive.mp4" in video_source:
            logger.info("Sample video not found. Auto-generating synthetic test footage...")
            from tools.generate_test_video import generate_test_video
            generate_test_video(output_path=video_source, duration_sec=10)
        else:
            logger.error(f"Input video file '{video_source}' does not exist.")
            sys.exit(1)

    # Initialize Engine Components
    camera = CameraStream(
        source=video_source,
        sample_fps=sample_fps,
        loop=loop_video,
        realtime=args.realtime,
    )

    detector = EdgeDetector(
        defect_model_path=defect_model_path,
        defect_conf=defect_conf,
        defect_iou=defect_iou,
        defect_imgsz=defect_imgsz,
        defect_target_classes=defect_classes,
        roi_horizon_ratio=horizon_ratio,
        enable_traffic=enable_traffic,
        traffic_model_path=traffic_model_path,
        traffic_conf=traffic_conf,
        traffic_iou=traffic_iou,
        traffic_imgsz=traffic_imgsz,
        traffic_target_classes=traffic_classes,
        enable_tracking=enable_tracking,
        tracker_type=tracker_type,
        device=target_device,
    )


    tracker = EdgeTracker(
        min_persistence_frames=min_persistence,
        max_staleness_frames=max_staleness,
        low_congestion_thresh=low_thresh,
        moderate_congestion_thresh=mod_thresh,
    ) if enable_tracking else None

    optical_flow = OpticalFlowVerifier(
        frame_delta_sec=flow_delta_sec,
        variance_threshold=flow_variance_thresh,
    ) if enable_optical_flow else None

    dispatcher = TelemetryDispatcher(
        api_url=backend_url,
        journey_id=journey_id,
        bus_id=bus_id,
        route_id=route_id,
        default_lat=cur_lat,
        default_lon=cur_lon,
        timeout_seconds=timeout_sec,
        save_evidence=save_evidence,
        evidence_dir=evidence_dir,
        enabled=enable_backend,
    )

    # If in Mode 3 (Field Survey GPX), dynamically register route with Central Platform
    if detected_gps_file and enable_backend:
        survey_coords = telemetry_source.get_route_coordinates()
        dispatcher.register_survey_route(
            route_name="NH-30 Raipur-Simga",
            coordinates=survey_coords,
            description="Field Survey Mobile Dashcam: NH-30 Simga Highway",
            distance_km=15.79,
        )

    # Estimate video duration for linear referencing
    total_duration_sec = 60.0
    if hasattr(camera, "cap") and camera.cap.isOpened():
        tot_f = camera.cap.get(cv2.CAP_PROP_FRAME_COUNT)
        fps_in = camera.cap.get(cv2.CAP_PROP_FPS)
        if tot_f > 0 and fps_in > 0:
            total_duration_sec = tot_f / fps_in

    frame_count = 0
    total_raw_detections = 0
    total_confirmed_defects = 0
    peak_active_vehicles = 0
    start_wall_time = time.time()

    logger.info(f"Starting Edge Dual-Head Inference Pipeline (Duration ~{total_duration_sec:.1f}s)...")

    try:
        for sampled_idx, timestamp_sec, frame in camera.frames():
            frame_count += 1
            t_infer_start = time.time()

            # Update instantaneous GPS based on active telemetry mode
            cur_lat, cur_lon, area_label = telemetry_source.get_coordinate(timestamp_sec, total_duration_sec)
            dispatcher.update_gps(cur_lat, cur_lon, video_timestamp_sec=timestamp_sec)

            # Push to optical flow buffer
            if optical_flow:
                optical_flow.push_frame(timestamp_sec, frame)

            # Run Dual-Head Inference (Defects on Ground ROI + Traffic on Forward Scene)
            detections = detector.detect(frame, apply_roi=True)
            t_infer_ms = (time.time() - t_infer_start) * 1000.0
            total_raw_detections += len(detections)

            active_tracks = []
            newly_confirmed = []
            traffic_stats = {
                "active_vehicles": 0,
                "cumulative_vehicles": 0,
                "congestion_level": "LOW",
                "hazard_alerts": [],
            }

            # Update ByteTrack tracker & compute traffic density metrics
            if tracker:
                active_tracks, newly_confirmed = tracker.update(detections, timestamp_sec)
                traffic_stats = tracker.get_traffic_stats()
                if traffic_stats["active_vehicles"] > peak_active_vehicles:
                    peak_active_vehicles = traffic_stats["active_vehicles"]

                # Enrich detection dicts with tracking metadata for UI badges
                for d in detections:
                    tid = d.get("track_id")
                    if tid is not None:
                        t_obj = tracker.get_track(tid)
                        if t_obj:
                            d["consecutive_hits"] = t_obj.consecutive_hits
                            d["min_persistence"] = tracker.min_persistence
                            d["is_confirmed"] = t_obj.is_confirmed

            # Process newly confirmed physical defects (passed persistence filter N >= 3)
            for confirmed_track in newly_confirmed:
                total_confirmed_defects += 1

                # Check specular water reflection (Improvement 2)
                is_water, flow_var = False, 0.0
                if optical_flow:
                    is_water, flow_var = optical_flow.verify_surface(
                        frame, timestamp_sec, confirmed_track.bbox
                    )

                water_tag = f" | [SPECULAR WATER (var={flow_var}) -> TIER 2 VLM]" if is_water else ""
                logger.info(
                    f"🚨 [CONFIRMED EVENT] Defect #{confirmed_track.track_id} "
                    f"[{confirmed_track.class_name.upper()}] "
                    f"(Conf: {confirmed_track.best_confidence:.2f}, Hits: {confirmed_track.total_hits}){water_tag}"
                )

                # Dispatch confirmed physical defect to FastAPI Backend with video timestamp
                dispatcher.dispatch_confirmed_defect(
                    track=confirmed_track,
                    lat=cur_lat,
                    lon=cur_lon,
                    evidence_crop=confirmed_track.best_crop,
                    video_timestamp_sec=timestamp_sec,
                )

            # Render visualization window if not headless
            if not args.headless:
                vis_frame = detector.annotate(frame, detections, show_roi=True)

                # Add dark telemetry banner header
                h, w = vis_frame.shape[:2]
                banner_h = 75
                overlay = vis_frame.copy()
                cv2.rectangle(overlay, (0, 0), (w, banner_h), (20, 20, 20), -1)
                cv2.addWeighted(overlay, 0.75, vis_frame, 0.25, 0, vis_frame)

                fps_current = frame_count / max(0.001, (time.time() - start_wall_time))
                active_defects = sum(1 for d in detections if d["category"] == "ROAD_DEFECT")

                # Congestion color badge
                cong_color = (0, 255, 0) if traffic_stats["congestion_level"] == "LOW" else (
                    (0, 230, 255) if traffic_stats["congestion_level"] == "MODERATE" else (0, 0, 255)
                )

                # Line 1: Telemetry, Ingestion Mode & Compute Hardware
                short_dev = "GPU (CUDA)" if str(target_device) not in ("cpu", "-1") else "CPU"
                line1 = (
                    f"FLINT EDGE [{bus_id} | {telemetry_source.get_mode_name()}] | {short_dev} | "
                    f"{fps_current:.1f} FPS | GPS: {cur_lat:.4f}, {cur_lon:.4f} ({area_label})"
                )
                cv2.putText(vis_frame, line1, (16, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)

                # Line 2: Traffic Congestion & TTC Safety
                line2_prefix = f"TRAFFIC: {traffic_stats['active_vehicles']} Vehicles Ahead ["
                cv2.putText(vis_frame, line2_prefix, (16, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (200, 200, 200), 1, cv2.LINE_AA)
                
                (pfx_w, _), _ = cv2.getTextSize(line2_prefix, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 1)
                cv2.putText(vis_frame, traffic_stats['congestion_level'], (16 + pfx_w, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.50, cong_color, 2, cv2.LINE_AA)
                
                (lvl_w, _), _ = cv2.getTextSize(traffic_stats['congestion_level'], cv2.FONT_HERSHEY_SIMPLEX, 0.50, 2)
                line2_suffix = f"] | Cumulative Seen: {traffic_stats['cumulative_vehicles']} | Pedestrians: {traffic_stats['active_pedestrians']}"
                cv2.putText(vis_frame, line2_suffix, (16 + pfx_w + lvl_w, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (200, 200, 200), 1, cv2.LINE_AA)

                # Line 3: Road Distress Triage
                line3 = (
                    f"DEFECT SCAN: {active_defects} in view | "
                    f"Verified Events Dispatched: {total_confirmed_defects} | Backend: {'LIVE' if enable_backend else 'OFFLINE'}"
                )
                cv2.putText(vis_frame, line3, (16, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 165, 255), 1, cv2.LINE_AA)

                # Real-time preview pacing: ensure visual playback matches 1.0x real-world speed
                target_interval_sec = 1.0 / max(1, sample_fps)
                time_spent_sec = time.time() - t_infer_start
                delay_ms = int(max(1, (target_interval_sec - time_spent_sec) * 1000))

                try:
                    cv2.imshow(f"FLINT Edge AI Dual-Head [{bus_id}]", vis_frame)
                    key = cv2.waitKey(delay_ms) & 0xFF
                    if key == ord("q"):
                        logger.info("Quit command ('q') received. Exiting loop...")
                        break
                    elif key == ord("p"):
                        logger.info("Paused. Press any key to resume...")
                        cv2.waitKey(0)
                except cv2.error as e:
                    logger.warning(f"GUI window display unavailable. Switching to headless mode: {e}")
                    args.headless = True

            if args.max_frames and frame_count >= args.max_frames:
                logger.info(f"Reached max frames limit ({args.max_frames}). Stopping...")
                break

    except KeyboardInterrupt:
        logger.info("Interrupted by user (Ctrl+C).")
    finally:
        camera.release()
        dispatcher.close()
        if not args.headless:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

        elapsed = time.time() - start_wall_time
        avg_fps = frame_count / max(0.001, elapsed)
        cumul_v = tracker.seen_vehicle_ids if tracker else set()

        logger.info("=" * 65)
        logger.info("FLINT Edge Dual-Head Inference Summary:")
        logger.info(f"  Total Sampled Frames:       {frame_count}")
        logger.info(f"  Cumulative Vehicles Counted: {len(cumul_v)}")
        logger.info(f"  Peak Vehicles in Scene:     {peak_active_vehicles}")
        logger.info(f"  Raw Detections Processed:   {total_raw_detections}")
        logger.info(f"  Verified Defect Events:     {total_confirmed_defects}")
        logger.info(f"  Total Elapsed Time:         {elapsed:.2f}s")
        logger.info(f"  Effective Processing Speed: {avg_fps:.1f} FPS")
        logger.info("=" * 65)

if __name__ == "__main__":
    main()

