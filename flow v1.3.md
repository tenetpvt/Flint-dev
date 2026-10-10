# Solution Flow — Urban Sense

### AI-Powered Bus-Camera Urban Sensing Platform 

This document describes the complete end-to-end data flow of the prototype — from existing bus camera recordings to authority-reviewed, actionable government interventions.

---

## Flow Overview

```
CCTV (Bus) → DVR/NVR → HDD Recording → Recorded Video Access
    → Edge Device → AI Models → JSON Events → Central Backend
    → Selective VLM Verification → PostgreSQL + PostGIS
    → Urban Intelligence Dashboard → Authority Review & Decision
    → Complaint Generation → Government Workflow / Action
```

Each stage is described below with the technical components involved.

---

# Stage 1 — CCTV Recording (On-Bus)

Bus-mounted cameras (front/rear/side/cabin) continuously record video to the bus's onboard **DVR/NVR and existing hard disk**, exactly as they do today for incident-recording purposes.

This existing recording pipeline is **untouched by our system** — it continues independently for security/legal/evidentiary retention, regardless of what the AI layer does downstream.

- **Note:** For the prototype, this stage is simulated using pre-recorded bus/dashcam-style footage instead of a live camera feed.

---

# Stage 2 — Recorded Video Access from DVR/NVR

The AI system accesses **video that has already been recorded by the existing DVR/NVR onto its hard disk**, rather than modifying or replacing the existing recording architecture.

The existing CCTV → DVR/NVR → HDD pipeline remains independent.

In a real deployment, the exact playback/access mechanism depends on the DVR/NVR manufacturer and may use supported interfaces such as:

- **RTSP** — for supported video streaming/playback access
- **ONVIF** — for supported device/stream interoperability
- Vendor SDK/API or recorded-video export/playback interfaces where required

For the prototype, this stage is simulated by reading a local video file directly (`cv2.VideoCapture()` in Python) — functionally equivalent to reading an RTSP stream, since the processing pipeline downstream doesn't care whether frames came from a live stream or a file.

---

# Stage 3 — Edge Device Runs AI Models

The edge device (simulated on a laptop for the prototype; a Jetson/RK3588-class device in a real deployment) processes the recorded video **locally**, frame by frame, using a **two-tier detection strategy** split by data availability.

### Tier 1 — Edge Specialist Models (always-on, offline-capable, no API cost)

Used for classes with strong labeled datasets, where trained specialist models are appropriate:

1. **Frame extraction** — frames sampled at a fixed rate rather than processing every frame.
2. **Detection models (YOLOv8)** — fine-tuned per task:
    - Road damage/potholes — RDD2022
    - Vehicles — COCO + IDD
    - Pedestrians — COCO `person` class
3. **Tracking (ByteTrack)** — persistent IDs for vehicles/pedestrians, vehicle counting and pedestrian-risk analysis.
4. **ANPR (proof-of-concept)** — plate detection → crop → OCR using EasyOCR/PaddleOCR.
5. **Post-processing filter** — detections must persist across multiple frames to reduce false positives.

### Tier 2 — Local VLM Verification (selective, event-triggered, no external AI API)

Used for events where semantic visual understanding is useful, such as:

- waterlogging
- missing road dividers
- missing zebra crossings
- damaged/missing signboards

Instead of continuously processing video with a VLM, lightweight triggers determine when a selected evidence frame requires semantic verification.

- **Geofenced trigger** (missing dividers/crossings/signboards) — these only make sense to check at specific locations. A local lookup of expected-infrastructure points (pre-loaded once from OpenStreetMap) is checked against live GPS via a `KDTree` distance query; only when the bus is within ~30m of an expected point is a frame captured for VLM verification, with a per-location cooldown (e.g., 24h) to avoid re-checking the same spot repeatedly.
- **Visual-anomaly trigger** (waterlogging) — no fixed location, so a fast classical-CV heuristic runs on every frame instead: comparing the road-region's brightness/hue to the sky-region's (water reflects the sky; dry asphalt doesn't). This is cheap pixel math, not a model — its only job is deciding whether a frame should be submitted for verification.
- **Rate limiting** — a hard cap (e.g., max 5 verification requests/minute per bus) sits in front of both triggers to prevent unnecessary bandwidth and server load.

When a trigger fires:

```
Edge trigger fires
       ↓
Select best evidence frame
       ↓
Preliminary event + image
       ↓
Central FastAPI Backend
       ↓
VLM Verification Queue
```

The backend then forwards the selected evidence frame to the **private on-premise VLM inference server**, where a locally hosted VLM such as **Qwen3-VL** runs through **Ollama**.

```
Central Backend
       ↓
Private VLM Server
       ↓
Ollama
       ↓
Qwen3-VL
       ↓
Structured JSON result
       ↓
Central Backend
```

Example:

```
{
  "hazard_type": "waterlogging",
  "severity": "moderate",
  "description": "standing water covering ~half the lane width",
  "visual_confidence": "medium"
}
```

The VLM result is merged with the preliminary edge event.

**No external AI API is required in the proposed deployment architecture.** The VLM inference server operates within the organization's controlled/private network, keeping AI inference and submitted evidence under organizational control.

If the VLM server is temporarily unavailable, the backend can queue the verification request and process it when the server becomes available again — the edge detection pipeline itself does not stop.

All of Tier 1 runs **on the edge device, not in the cloud** — this remains the core "Edge AI" component. Tier 2 is deliberately limited to selected evidence frames requiring semantic verification rather than continuous video analysis.

---

# Stage 4 — JSON Event Generation

Once a detection is confirmed, the edge device packages it into a lightweight structured event rather than sending raw video.

```
{
  "id": "evt_1029",
  "bus_id": "BUS_07",
  "route_id": "route_2",
  "alert_type": "pothole",
  "source": "edge_model",
  "confidence_score": 0.94,
  "latitude": 21.2528,
  "longitude": 81.6489,
  "timestamp": "2026-09-06T10:32:15Z",
  "severity": "medium",
  "status": "new",
  "evidence_image_url": "...",
  "area_label": "Pandri",
  "metadata": {}
}
```

For Tier 2 events, the preliminary event and selected evidence frame are sent to the central backend for VLM verification.

**For Tier 2 events, the preliminary event and selected evidence frame are sent to the central backend for VLM verification; the full video never leaves the bus.**

This is what satisfies the problem statement's "minimizing bandwidth through intelligent edge processing" requirement.


---

# Stage 5 — Central Backend, VLM Orchestration & Database

The edge device pushes events to a central **FastAPI** ingestion endpoint such as:

```
POST /alerts
```

The central backend acts as the orchestration layer between:

- bus edge devices
- VLM inference server
- database
- urban intelligence engine
- dashboard

### Tier 1 — Normal Edge Event

```
Edge Device
     ↓
POST /alerts
     ↓
FastAPI
     ↓
PostgreSQL + PostGIS
```

### Tier 2 — VLM-Required Event

```
Edge Device
     ↓
Preliminary event + selected evidence frame
     ↓
FastAPI
     ↓
VLM Verification Queue
     ↓
Private On-Premise VLM Server
     ↓
Ollama + Qwen3-VL
     ↓
Structured VLM Result
     ↓
FastAPI
     ↓
PostgreSQL + PostGIS
```

The backend can:

- decide whether an event requires VLM verification
- queue VLM requests
- forward only selected evidence frames
- validate VLM results
- merge VLM results with edge events
- store final events
- retry failed VLM requests
### Database

**PostgreSQL + PostGIS** stores:

- alerts
- GPS coordinates
- bus/route information
- timestamps
- severity/confidence
- complaint records
- spatial clusters
- authority actions

PostGIS enables geographic analysis such as identifying recurring defects within a defined radius.

### Private VLM Server

```
Linux / Windows Server
        ↓
NVIDIA GPU
        ↓
Ollama
        ↓
Local VLM — Qwen3-VL
        ↓
Internal VLM API
```

For the prototype, this can be a **separate laptop running Ollama**, while the edge/backend runs on the primary laptop.

If connectivity between the bus and central backend is temporarily unavailable, events are queued locally and retried using a **store-and-forward** mechanism.

---

# Stage 6 — Urban Intelligence Dashboard

The web dashboard, built using **React + Leaflet**, queries the central backend and presents fleet-wide information to transport authorities.

The dashboard does not communicate directly with individual buses.

### Dashboard provides:

- **Live Map** — bus routes, positions and alert markers
- **Alert Feed** — incoming alerts with evidence and confidence
- **Road Condition Map** — potholes and infrastructure deficiencies
- **Traffic Heatmaps** — vehicle density and congestion patterns
- **Incident Reports** — critical events and supporting evidence
- **Recurring Defect Clusters** — repeated detections from multiple buses
- **Analytics** — area-wise and time-based trends
- **Action Recommendations** — prioritized issues requiring authority attention

The dashboard therefore becomes the point where **AI-generated information is converted into an authority decision**.

---

# Stage 7 — Authority Review & Decision

Transport authority staff review the alerts, evidence and recommended actions before any official complaint is generated or routed.

```
AI Detection / Cluster
        ↓
Dashboard
        ↓
Authority Reviews Evidence
        ↓
┌─────────────┬─────────────┐
│   Approve   │   Reject    │
└──────┬──────┴──────┬──────┘
       ↓             ↓
 Complaint       False Positive
 Generation          / Log
```

Authority actions include:

|Action|Example|
|---|---|
|**Read**|View alert, evidence, location and history|
|**Update**|Change status/add remarks|
|**Approve**|Approve issue for complaint generation|
|**Reject**|Mark as false positive|
|**Delete**|Remove confirmed false-positive records|

Authority decisions are recorded in the system, providing an accountability trail.

Rejected/false-positive detections can also become useful feedback for future model refinement.

---

# Stage 8 — Complaint Generation & Government Action

Only **after authority approval** does the Complaint Generation Engine convert the approved issue into a formal complaint/action request.

There are two paths.

### Path A — Emergency / Critical Incident

```
Critical Alert
      ↓
Dashboard
      ↓
Authority Review
      ↓
Approve
      ↓
Complaint Generated
      ↓
Relevant Department / Workflow
      ↓
Resolution
```

Critical incidents such as hit-and-run or severe hazards can therefore be prioritized immediately while still retaining human authority approval.

### Path B — Recurring Defect

Multiple detections of the same issue are consolidated instead of generating duplicate complaints.

Example:

```
Bus 01 → Pothole
Bus 04 → Pothole
Bus 07 → Pothole
Bus 09 → Pothole
       ↓
PostGIS Spatial Clustering
       ↓
Recurring Defect Cluster
       ↓
Dashboard
       ↓
Authority Review
       ↓
Approve
       ↓
Single Consolidated Complaint
```

### Recurring-defect trigger

A cluster can be considered actionable when it has:

- ≥3 alerts of the same type
- within approximately 300–500 m
- from ≥2 distinct buses
- within a rolling 7-day window

PostGIS performs the spatial clustering as a scheduled background process.

This prevents the same road defect from generating multiple duplicate complaints.

### Complaint lifecycle

```
Approved Issue
      ↓
Complaint Draft
      ↓
Pending Submission
      ↓
Authority Confirmation
      ↓
Submitted
      ↓
Resolved
```

The complaint record can contain:

- complaint ID
- complaint type
- linked alert IDs
- location
- number of independent sightings
- first/last observed time
- best evidence
- suggested department
- authority reviewer
- submission reference
- resolution status

### Government workflow

In a real deployment, the approved complaint can be routed to the relevant department's existing workflow, such as a state PWD system or other authorized government grievance/work-order system.

For the prototype, this submission is **mocked** and can return a demonstration reference ID.

### Why human approval?

Urban Sense deliberately follows:

> **AI detects. AI recommends. Human authority decides.**

This prevents false AI/VLM detections from automatically becoming official government records and provides an auditable authority decision trail.

---

# Summary Diagram

```
┌─────────────────────────┐
│ EXISTING BUS CCTV       │
│ Cameras → DVR/NVR → HDD │
│ Original recording      │
│ remains untouched       │
└────────────┬────────────┘
             │
             │ Recorded Video Access
             ▼
┌─────────────────────────┐
│ EDGE DEVICE             │
│ YOLOv8 • ByteTrack      │
│ ANPR/OCR • Validation   │
└────────────┬────────────┘
             │
             │ Preliminary Event
             │ + Evidence Frame
             ▼
┌─────────────────────────┐
│ CENTRAL FASTAPI BACKEND │
│ Ingestion • Queue       │
│ VLM Orchestration       │
└────────────┬────────────┘
             │
             │ Selected events
             ▼
┌─────────────────────────┐
│ PRIVATE VLM SERVER      │
│ Ollama • Qwen3-VL       │
└────────────┬────────────┘
             │
             │ Verified Result
             ▼
┌─────────────────────────┐
│ POSTGRESQL + POSTGIS    │
│ Events • GPS • Clusters │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ URBAN INTELLIGENCE      │
│ DASHBOARD               │
│ Map • Alerts • Analytics│
└────────────┬────────────┘
             │
             │ Review
             ▼
┌─────────────────────────┐
│ TRANSPORT AUTHORITY     │
│ Approve • Edit • Reject │
└────────────┬────────────┘
             │
             │ Approved
             ▼
┌─────────────────────────┐
│ COMPLAINT GENERATION    │
│ & ACTION ENGINE         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ RELEVANT GOVT WORKFLOW  │
│ PWD / Traffic / etc.    │
└────────────┬────────────┘
             │
             ▼
        RESOLUTION
```# Solution Flow — Urban Sense

### AI-Powered Bus-Camera Urban Sensing Platform (BEL Hackathon)

This document describes the complete end-to-end data flow of the prototype — from existing bus camera recordings to authority-reviewed, actionable government interventions.

---

## Flow Overview

```
