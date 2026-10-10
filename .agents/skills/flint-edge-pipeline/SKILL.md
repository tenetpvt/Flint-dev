---
name: flint-edge-pipeline
description: >-
  Comprehensive runbook for developing, testing, and running the FLINT Onboard Edge AI pipeline.
  Use when testing or executing the bus camera ingestion loop, Dual-Head YOLOv8 defect and traffic detection,
  ByteTrack multi-frame persistence, Ground ROI polygon masking, Optical Flow surface verification,
  3-Mode GPS telemetry (AIS-140, Linear Referencing, GPX/SRT/CSV), fast-mode benchmarking, or telemetry dispatch.
---

# FLINT Edge AI Pipeline Runbook

This skill provides comprehensive instructions, architecture reference, and step-by-step operational workflows for the onboard Edge AI subsystem located in `edge/` within the FLINT / Urban Sense platform.

---

## Subsystem Architecture & Directory Layout

The Edge subsystem runs onboard transit buses or survey vehicles. It ingests forward-facing camera feeds, masks out non-road regions, runs dual-head YOLOv8 neural inference, tracks candidates across consecutive frames, validates surface properties via optical flow, correlates high-precision GNSS coordinates, and asynchronously dispatches confirmed telemetry and JPEG evidence crops to the Central Backend.

```text
edge/
├── config.yaml                 # Primary edge configuration (models, thresholds, ROI, telemetry)
├── requirements.txt            # ultralytics, opencv-python, numpy, pyyaml, requests, scipy, easyocr
├── main.py                     # Main CLI orchestrator connecting camera, inference, tracking & dispatch
├── src/
│   ├── __init__.py
│   ├── camera.py               # Video/RTSP capture loop with target FPS sampling & real-time sync
│   ├── detector.py             # Dual-Head YOLOv8 (Road Defect specialist + Traffic specialist) + Ground ROI
│   ├── tracker.py              # ByteTrack tracking, multi-frame persistence gating (N >= 2), congestion & TTC
│   ├── optical_flow.py         # Temporal epipolar optical flow verifier (specular water puddle vs dry asphalt)
│   ├── telemetry_source.py     # 3-Mode Telemetry Engine (AIS-140 serial, Linear route, GPX/SRT/CSV survey)
│   └── dispatcher.py           # Asynchronous HTTP Keep-Alive dispatcher with worker queue & evidence cropping
├── tools/
│   ├── generate_test_video.py  # Generates synthetic 1080p road video with procedural potholes & cracks
│   └── extract_video_gps.py    # EasyOCR on-screen GPS Map Camera overlay extractor (MP4 -> GPX/CSV)
├── models/                     # Custom defect weights (e.g., flint_india_yolov8.pt, rdd2022_yolov8.pt)
├── evidence_crops/             # Local snapshot cache of confirmed defect bounding box crops
├── pothole vid bus full.mp4    # Real-world field survey highway test video
├── pothole vid bus full.gpx    # Extracted companion GPX 1.1 survey coordinates
└── pothole vid bus full.csv    # Extracted companion CSV timestamped coordinates

run_edge.bat                    # Root batch launcher utilizing backend\venv\Scripts\python.exe
```

---

## Core Algorithmic Components

### 1. Ground ROI Polygon Masking (`edge/src/detector.py`)
* **Objective:** Prevents false triggers from overhead sky glare, street lighting, roadside billboards, and tree canopy shadows.
* **Mechanism:** A binary horizon mask zeroes out the upper portion of the frame (`horizon_ratio`, default `0.22` scanning the lower 78% of the road ahead, or `0.40`).
* Defect bounding boxes whose vertical bottom (`y2`) resides above the horizon cutoff are automatically rejected before tracking.

### 2. Dual-Head YOLOv8 Inference (`edge/src/detector.py`)
The pipeline runs two decoupled specialist heads:
1. **Road Surface Defect Specialist:**
   * Model: `edge/models/flint_india_yolov8.pt` (or `rdd2022_yolov8.pt`)
   * Classes: Potholes, Alligator Cracks, Transverse/Longitudinal Cracks.
   * Input: Ground ROI masked road surface frame at high resolution (`imgsz: 640` or `960`).
2. **Traffic Congestion & Safety Specialist:**
   * Model: `yolov8n.pt`
   * Classes: Pedestrians, Bicycles, Cars, Motorcycles, Buses, Trucks (`[0, 1, 2, 3, 5, 7]`).
   * Input: Forward scene (top 15% clouds/sky masked, retaining forward horizon).
   * Computes dynamic congestion levels (`LOW`, `MODERATE`, `HIGH`) and Time-to-Collision (TTC).

### 3. ByteTrack Multi-Frame Persistence Gating (`edge/src/tracker.py`)
* **Problem:** Single-frame camera noise, oil stains, or fleeting tire shadows can trigger transient false positives.
* **Filter Rule:** Alerts are only emitted when a defect candidate's persistent `track_id` is observed across $\ge N$ consecutive frames (`min_persistence_frames`, default `2` or `3`).
* Retains the highest-confidence bounding box crop across all observed frames for evidence snapshotting.

### 4. Optical Flow Specular Water Verifier (`edge/src/optical_flow.py`)
* **Objective:** Disambiguates standing water puddles / wet slush from dry rigid road defects under monsoon sunlight.
* **Mechanism:** Maintains a temporal buffer (~0.5s delta). Evaluates Lucas-Kanade optical flow motion variance over candidate ROIs.
* Rigid road surfaces conform to camera planar homography (low variance), whereas water glints and ripples exhibit high variance (`flow_variance > variance_threshold`). Detected water events are tagged for Tier-2 VLM review.

### 5. Multi-Source Telemetry Engine (`edge/src/telemetry_source.py`)
Supports three distinct operating modes:
* **Mode 1: AIS-140 Hardware GPS Stream (`LiveSerialSource`):**
  * Reads continuous NMEA `$GPGGA` sentences via serial/CAN interface (`--live-gps COM3`).
* **Mode 2: Linear Route Referencing (`LinearRouteSource`):**
  * Used for synthetic or un-geotagged test drives. Interpolates vehicle distance along an assigned transit corridor (e.g. Route `R3` / GE Road, Raipur) using cumulative Haversine distance calculations.
* **Mode 3: Real Field Survey Companion Logs (`GpxSrtFileSource`):**
  * Ingests smartphone dashcam companion files (`.gpx`, `.srt`, `.csv`).
  * Features `auto_detect_gps_file()` which automatically binds matching GPS logs having the same basename as the input video.
  * Includes GPS outlier spike sanitization (`_clean_outliers`) to correct OCR misreads or satellite bounce.
  * Automatically registers new survey routes with Central Platform via `dispatcher.register_survey_route()`.

### 6. Non-Blocking Telemetry Dispatcher (`edge/src/dispatcher.py`)
* Operates on a dedicated background worker thread with a 1,000-event FIFO queue.
* Reuses persistent HTTP Keep-Alive sessions (`requests.Session` with `HTTPAdapter` connection pooling).
* Emits regular bus heartbeat pings (`/api/edge/telemetry`) every 1.0 second.
* Encodes high-resolution JPEG evidence crops to disk (`edge/evidence_crops/`) and dispatches structured event payloads to central backend (`POST /api/ingest/detection`).

---

## Standard Operational Workflows

### 1. Launching via Root Helper Script (`run_edge.bat`)

The recommended execution wrapper automatically resolves the project virtual environment at `backend\venv\Scripts\python.exe`:

```powershell
# Run with default configuration (camera source, loop enabled, visual HUD)
.\run_edge.bat

# Pass custom video and arguments
.\run_edge.bat --video "edge/pothole vid bus full.mp4" --conf 0.25
```

### 2. Fast Repopulation / Benchmark Mode (`--fast`)

When testing database repopulation or verifying frontend dashboard ingestion rapidly, run with `--fast` (or `--benchmark`) and `--headless`. This disables the real-time 1.0x playback rate sleep limiter and runs inference at maximum GPU throughput:

```powershell
.\run_edge.bat --video "edge/pothole vid bus full.mp4" --fast --headless
```

### 3. Real Field Survey Demonstration (Mode 3 GPS Sync)

When demonstrating real highway inspection using dashcam footage accompanied by GPX logs:

```powershell
# Automatically discovers companion 'pothole vid bus full.gpx' and registers route NH-30
.\run_edge.bat --video "edge/pothole vid bus full.mp4" --conf 0.25 --device 0
```

### 4. Synthetic Video Generation & Route Simulation

When testing on systems without external video files:

```powershell
# 1. Generate 15 seconds of synthetic 1080p road video with defects
.\backend\venv\Scripts\python edge/tools/generate_test_video.py --output edge/sample_drive.mp4 --duration 15

# 2. Run simulation with linear route referencing along Raipur Route R3
.\run_edge.bat --video edge/sample_drive.mp4 --route R3 --conf 0.35
```

### 5. Extracting GPS from Video HUD Overlays (`extract_video_gps.py`)

If a field video contains on-screen GPS text (e.g., GPS Map Camera recordings) without a standalone GPX file:

```powershell
.\backend\venv\Scripts\python edge/tools/extract_video_gps.py --video "edge/pothole vid bus full.mp4" --interval 1.0
```
This generates companion `.gpx` and `.csv` files in the same directory, ready for immediate ingestion by Mode 3.

### 6. Headless Standalone / Unit Testing Mode

To verify edge inference without connecting to the central FastAPI backend:

```powershell
.\run_edge.bat --video edge/sample_drive.mp4 --headless --no-backend --max-frames 150
```

---

## CLI Argument Reference (`edge/main.py`)

| Argument | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--config` | string | `edge/config.yaml` | Path to edge YAML configuration file |
| `--video` | string | *Config value* | Video file path, RTSP stream URL, or USB camera index |
| `--conf` | float | *Config value* | Override defect detection confidence threshold (e.g. `0.25`) |
| `--sample-fps` | int | `10` | Frame ingestion sampling rate (prevents edge thermal throttling) |
| `--imgsz` | int | `640` | Inference resolution (e.g. `640`, `960`) |
| `--device` | string/int | `0` | Compute device: `0` for NVIDIA CUDA GPU, `'cpu'` for CPU fallback |
| `--headless` | flag | `False` | Disables OpenCV GUI preview window for headless edge/server runs |
| `--max-frames` | int | `None` | Automatically stop after processing N sampled frames |
| `--realtime` | flag | `True` | Enforce 1.0x real-world playback speed |
| `--fast` / `--benchmark` | flag | `False` | Run at uncapped GPU/CPU throughput without delay throttling |
| `--gps` | string | `None` | Path to companion `.gpx`, `.srt`, or `.csv` GPS log (Mode 3) |
| `--route` | string | `R3` | Route corridor identifier for linear referencing (Mode 2) |
| `--live-gps` | string | `None` | Serial COM port for AIS-140 hardware GPS receiver (Mode 1) |
| `--save-evidence` | flag | `True` | Save cropped defect images to `edge/evidence_crops` |
| `--no-backend` | flag | `False` | Disable HTTP telemetry dispatch to central backend |

---

## Hardware Compute & CUDA Setup

* **GPU Acceleration:** NVIDIA GPUs (RTX 3050/3060, Jetson Orin Nano, AGX Orin) require a CUDA-enabled PyTorch build.
* **Auto-Fallback Guard:** If CUDA is unavailable (`torch.cuda.is_available() == False`), `EdgeDetector` logs a warning and automatically falls back to CPU execution without crashing.
* **FPS Throttling:** `CameraStream` maintains target `sample_fps` (default 10 FPS) to leave ample compute headroom for multi-model inference and tracking.

---

## Verification Checkpoints

When running edge pipeline diagnostics, verify:
1. **Console Banner:** Confirm device ID (`NVIDIA GPU` vs `CPU (Fallback)`), active telemetry mode, and model paths print during initialization.
2. **Ground ROI Active:** Upper horizon is masked out in preview/logs, preventing sky/horizon false triggers.
3. **Persistence Count:** Defect logs print `[CONFIRMED EVENT]` only after track ID achieves $\ge N$ consecutive hits (`consecutive_hits >= min_persistence`).
4. **Dispatcher Status:** Telemetry worker logs `[HTTP 200] Dispatched detection` without queue overflow or frame drop in the primary CV loop.
