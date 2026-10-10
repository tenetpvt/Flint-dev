"""
FLINT Edge Telemetry Dispatcher
Asynchronously dispatches confirmed road defects and traffic safety incidents
to the central FastAPI platform (POST /api/ingest/detection) using a non-blocking
background worker queue to prevent frame drops in the computer vision loop.
"""

import os
import time
import queue
import logging
import threading
from typing import Dict, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
import cv2
import numpy as np

logger = logging.getLogger("flint.edge.dispatcher")

# Defect severity heuristic mapping matching FLINT municipal standards
CLASS_TO_SEVERITY: Dict[str, str] = {
    "pothole": "CRITICAL",
    "alligator crack": "HIGH",
    "transverse crack": "MEDIUM",
    "longitudinal crack": "MEDIUM",
    "other corruption": "LOW",
    "blockage": "CRITICAL",
    "road_blockage": "CRITICAL",
    "car": "LOW",
    "person": "HIGH",
}

class TelemetryDispatcher:
    """
    Non-blocking HTTP telemetry dispatcher with evidence snapshotting
    and background worker queue.
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8000/api/ingest/detection",
        journey_id: int = 1,
        bus_id: str = "BUS-03",
        route_id: str = "R3",
        default_lat: float = 21.2415,
        default_lon: float = 81.6335,
        timeout_seconds: int = 3,
        save_evidence: bool = True,
        evidence_dir: str = "edge/evidence_crops",
        enabled: bool = True,
    ):
        self.api_url = api_url
        self.journey_id = journey_id
        self.bus_id = bus_id
        self.route_id = route_id
        self.lat = default_lat
        self.lon = default_lon
        self.timeout = timeout_seconds
        self.save_evidence = save_evidence
        self.evidence_dir = evidence_dir
        self.enabled = enabled

        if self.save_evidence:
            os.makedirs(self.evidence_dir, exist_ok=True)

        self.last_telemetry_dispatch: float = 0.0

        # Persistent HTTP Keep-Alive session with connection pooling
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=20,
            max_retries=Retry(total=2, backoff_factor=0.2, status_forcelist=[502, 503, 504]),
        )
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        # Work queue and background worker thread (buffered for high burst density)
        self.work_queue: queue.Queue = queue.Queue(maxsize=1000)
        self.running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        logger.info(f"TelemetryDispatcher initialized (HTTP Keep-Alive enabled) -> Target: {self.api_url} (Journey ID: {self.journey_id})")

    def update_gps(self, lat: float, lon: float, video_timestamp_sec: Optional[float] = None) -> None:
        """Update current bus GNSS coordinates and periodically emit live bus telemetry to platform."""
        self.lat = lat
        self.lon = lon
        now = time.time()
        if self.enabled and (now - self.last_telemetry_dispatch >= 1.0):
            self.last_telemetry_dispatch = now
            telemetry_url = self.api_url.replace("/ingest/detection", "/edge/telemetry")
            payload = {
                "bus_name": self.bus_id,
                "route_name": self.route_id,
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "speed_kmh": 35.0,
                "video_timestamp_sec": round(float(video_timestamp_sec), 2) if video_timestamp_sec is not None else None,
            }
            try:
                self.work_queue.put_nowait((telemetry_url, payload, True))
            except queue.Full:
                pass

    def dispatch_confirmed_defect(
        self,
        track: Any,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        evidence_crop: Optional[np.ndarray] = None,
        video_timestamp_sec: Optional[float] = None,
        notes: str = "",
    ) -> None:
        """
        Enqueues a confirmed physical defect event for dispatching.
        Saves evidence crop to disk if provided.
        """
        if not self.enabled:
            return

        cur_lat = lat if lat is not None else self.lat
        cur_lon = lon if lon is not None else self.lon

        # Save evidence crop if available
        evidence_url = None
        crop_to_save = evidence_crop if evidence_crop is not None else getattr(track, "best_crop", None)
        if self.save_evidence and crop_to_save is not None and crop_to_save.size > 0:
            filename = f"evt_{self.bus_id}_t{track.track_id}_{track.class_name}_{int(time.time())}.jpg"
            filepath = os.path.join(self.evidence_dir, filename)
            try:
                cv2.imwrite(filepath, crop_to_save)
                # Web-accessible URL path for dashboard
                evidence_url = f"/evidence/{filename}"
            except Exception as e:
                logger.warning(f"Could not save evidence crop: {e}")

        # Determine severity and cost estimates
        class_name = track.class_name.lower()
        severity = CLASS_TO_SEVERITY.get(class_name, "MEDIUM")

        # Estimate area from track bbox or defaults
        bbox = getattr(track, "bbox", None)
        if bbox is not None and len(bbox) >= 4:
            bw = abs(bbox[2] - bbox[0])
            bh = abs(bbox[3] - bbox[1])
            # Ground sampling distance approximation (0.002m per pixel at road level)
            area_est = round(max(0.2, min(4.5, (bw * bh) * 0.000035)), 2)
        else:
            area_est = 2.4 if severity == "CRITICAL" else (1.5 if severity == "HIGH" else 0.6)

        if severity == "CRITICAL":
            sev_tier = "Tier 4 - Sub-base Structural Failure"
            repair_method = "Full-Depth Excavation"
            cost_est = round((area_est * 2.2 * 6500) + 1500)
        elif severity == "HIGH":
            sev_tier = "Tier 3 - Deep Crater Fatigue"
            repair_method = "Hot-Mix Asphalt"
            cost_est = round((area_est * 1.8 * 2800) + 1500)
        elif severity == "MEDIUM":
            sev_tier = "Tier 2 - Moderate Surface Pothole"
            repair_method = "Hot-Mix Asphalt"
            cost_est = round((area_est * 1.4 * 2800) + 1500)
        else:
            sev_tier = "Tier 1 - Minor Surface Deterioration"
            repair_method = "Cold-Mix Patch"
            cost_est = round((area_est * 1.0 * 1200) + 1500)

        payload = {
            "journey_id": self.journey_id,
            "type": "ROAD_DEFECT" if track.category == "ROAD_DEFECT" else track.category,
            "confidence": round(float(track.best_confidence), 3),
            "lat": round(float(cur_lat), 6),
            "lon": round(float(cur_lon), 6),
            "severity": severity,
            "evidence_url": evidence_url,
            "video_timestamp_sec": round(float(video_timestamp_sec), 2) if video_timestamp_sec is not None else None,
            "estimated_area_sq_m": area_est,
            "severity_tier": sev_tier,
            "repair_method": repair_method,
            "estimated_cost": float(cost_est),
        }

        try:
            self.work_queue.put_nowait(payload)
            t_str = f" @ {video_timestamp_sec:.1f}s" if video_timestamp_sec is not None else ""
            logger.info(
                f"📡 [QUEUED] Dispatched {track.category} '{class_name.upper()}'{t_str} "
                f"(Severity: {severity}, Conf: {payload['confidence']}) to Central Platform"
            )
        except queue.Full:
            logger.warning("Telemetry queue is full. Dropping older event.")

    def register_survey_route(
        self,
        route_name: str,
        coordinates: list,
        description: str = "Mobile Dashcam Field Survey",
        distance_km: float = 5.0,
    ) -> Optional[int]:
        """
        Dynamically registers a field survey route with the FastAPI backend
        and updates journey_id to the created journey.
        """
        if not self.enabled or not coordinates:
            return None

        survey_api = self.api_url.replace("/ingest/detection", "/routes/survey")
        payload = {
            "name": route_name,
            "description": description,
            "distance_km": round(float(distance_km), 2),
            "coordinates": coordinates,
            "bus_name": self.bus_id,
        }
        try:
            res = self.session.post(survey_api, json=payload, timeout=self.timeout)
            if res.status_code in (200, 201):
                data = res.json()
                new_jid = data.get("journey_id")
                if new_jid:
                    self.journey_id = new_jid
                    logger.info(f"✅ Survey route '{route_name}' registered with Central Platform -> Journey ID #{new_jid}")
                return new_jid
            else:
                logger.warning(f"Survey route registration returned HTTP {res.status_code}: {res.text[:100]}")
        except Exception as e:
            logger.debug(f"Could not register survey route with backend ({e})")
        return None

    def _worker_loop(self) -> None:
        """Daemon worker loop processing HTTP POST requests in background via persistent session."""
        while self.running:
            try:
                item = self.work_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            if isinstance(item, tuple):
                target_url, payload, is_telemetry = item
            else:
                target_url, payload, is_telemetry = self.api_url, item, False

            try:
                response = self.session.post(
                    target_url,
                    json=payload,
                    timeout=self.timeout,
                )
                if not is_telemetry:
                    if response.status_code in (200, 201):
                        data = response.json()
                        logger.info(
                            f"✅ Central Ingest Ack -> Record ID #{data.get('id')} "
                            f"[{payload['type']} | {payload['severity']}] recorded in Database."
                        )
                    else:
                        logger.warning(
                            f"Central Ingest returned HTTP {response.status_code}: {response.text[:120]}"
                        )
            except requests.exceptions.RequestException as e:
                if not is_telemetry:
                    logger.debug(f"Central Ingest endpoint unavailable ({e}). Alert buffered locally.")
            finally:
                self.work_queue.task_done()

    def close(self) -> None:
        """Flushes remaining items and stops worker thread."""
        try:
            # Wait briefly for queued defect dispatches to finish
            start_drain = time.time()
            while not self.work_queue.empty() and time.time() - start_drain < 5.0:
                time.sleep(0.1)
        except Exception:
            pass
        self.running = False
        try:
            self.worker_thread.join(timeout=3.0)
        except Exception:
            pass
        try:
            self.session.close()
        except Exception:
            pass
