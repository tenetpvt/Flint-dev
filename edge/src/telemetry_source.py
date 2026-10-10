"""
FLINT Multi-Source Edge Telemetry Engine
Supports 3 ingestion sources:
  Mode 1: AIS-140 Serial/Hardware GPS Stream
  Mode 2: Synthetic Route Binding (Linear Referencing along Route R3)
  Mode 3: Field Survey Dashcam companion logs (.gpx, .srt, .csv)
"""

import os
import re
import math
import json
import logging
import sqlite3
from abc import ABC, abstractmethod
from typing import List, Tuple, Optional, Dict, Any

logger = logging.getLogger("flint.edge.telemetry")

# Fallback high-resolution GE Road (R3) coordinates if database is offline
R3_FALLBACK_WAYPOINTS: List[List[float]] = [
    [81.564869, 21.257979], [81.566379, 21.258594], [81.568770, 21.259464],
    [81.571366, 21.260261], [81.575569, 21.259773], [81.579921, 21.258953],
    [81.586792, 21.257264], [81.591522, 21.255952], [81.595374, 21.254178],
    [81.598300, 21.252646], [81.600420, 21.250749], [81.603638, 21.248048],
    [81.607176, 21.244961], [81.611547, 21.243584], [81.615811, 21.242540],
    [81.620645, 21.241183], [81.625810, 21.239810], [81.629842, 21.240412],
    [81.633512, 21.241528], [81.636621, 21.244122], [81.640040, 21.245432],
    [81.644303, 21.244774], [81.648722, 21.243670], [81.653615, 21.242564],
    [81.658359, 21.241540], [81.662300, 21.239864], [81.667195, 21.239387],
    [81.671647, 21.238816], [81.677695, 21.238731]
]

class TelemetrySource(ABC):
    """Abstract interface for edge telemetry sources."""

    @abstractmethod
    def get_coordinate(self, timestamp_sec: float, total_duration_sec: float) -> Tuple[float, float, str]:
        """Returns (latitude, longitude, area_label)."""
        pass

    @abstractmethod
    def get_route_coordinates(self) -> List[List[float]]:
        """Returns [[lon, lat], ...] polyline coordinates for map display."""
        pass

    @abstractmethod
    def get_mode_name(self) -> str:
        """Returns human-readable mode label for HUD."""
        pass


class LinearRouteSource(TelemetrySource):
    """
    Mode 2: Synthetic / Benchmark Route Binding
    Uses proportional linear referencing (t / T_total) along an assigned transit corridor.
    Allows any arbitrary test video to drive smoothly along Raipur's GE Road.
    """

    def __init__(self, route_name: str = "R3", db_path: str = "backend/flint.db"):
        self.route_name = route_name
        self.points: List[List[float]] = self._load_points(route_name, db_path)
        self.cum_distances = self._compute_cumulative_distances(self.points)
        self.total_distance = self.cum_distances[-1] if self.cum_distances else 1.0
        logger.info(f"LinearRouteSource initialized on '{route_name}' ({len(self.points)} points, {self.total_distance:.2f} km)")

    def _load_points(self, route_name: str, db_path: str) -> List[List[float]]:
        """Load route line from SQLite if available, else use fallback."""
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT geojson_path FROM routes WHERE name = ?", (route_name,))
                row = cursor.fetchone()
                conn.close()
                if row and row[0]:
                    coords = json.loads(row[0])
                    if coords and len(coords) >= 2:
                        return coords
            except Exception as e:
                logger.debug(f"Could not read route from DB: {e}")
        return R3_FALLBACK_WAYPOINTS

    @staticmethod
    def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
        r = 6371.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2)**2
        return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _compute_cumulative_distances(self, pts: List[List[float]]) -> List[float]:
        cum = [0.0]
        for i in range(1, len(pts)):
            d = self._haversine_km(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1])
            cum.append(cum[-1] + d)
        return cum

    def get_coordinate(self, timestamp_sec: float, total_duration_sec: float) -> Tuple[float, float, str]:
        if not self.points or len(self.points) < 2:
            return 21.2415, 81.6335, "Raipur Center"

        duration = max(1.0, total_duration_sec)
        progress = min(1.0, max(0.0, timestamp_sec / duration))
        target_dist = progress * self.total_distance

        # Find polyline segment
        idx = 0
        while idx < len(self.cum_distances) - 1 and self.cum_distances[idx + 1] < target_dist:
            idx += 1

        if idx >= len(self.points) - 1:
            pt = self.points[-1]
            return pt[1], pt[0], f"{self.route_name} Corridor End"

        seg_start = self.cum_distances[idx]
        seg_end = self.cum_distances[idx + 1]
        seg_len = max(0.0001, seg_end - seg_start)
        seg_prog = (target_dist - seg_start) / seg_len

        p1 = self.points[idx]
        p2 = self.points[idx + 1]
        lon = p1[0] + (p2[0] - p1[0]) * seg_prog
        lat = p1[1] + (p2[1] - p1[1]) * seg_prog

        area = "GE Road Corridor"
        if progress < 0.25:
            area = "Tatibandh / AIIMS"
        elif progress < 0.50:
            area = "NIT Raipur / GE Road"
        elif progress < 0.75:
            area = "Jaistambh Chowk"
        else:
            area = "Telibandha Marine Drive"

        return lat, lon, area

    def get_route_coordinates(self) -> List[List[float]]:
        return self.points

    def get_mode_name(self) -> str:
        return f"ROUTE BINDING ({self.route_name})"


class GpxSrtFileSource(TelemetrySource):
    """
    Mode 3: Real Field Survey Dashcam Telemetry
    Parses companion .gpx, .srt, or .csv files recorded via smartphone dashcam apps
    (Droid Dashcam, GPS Logger, etc.) and indexes GPS coordinates by second.
    """

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.records: List[Dict[str, Any]] = [] # [{"time": sec, "lat": lat, "lon": lon}]
        self._parse_file(file_path)
        self._clean_outliers()
        logger.info(f"GpxSrtFileSource loaded {len(self.records)} GPS points from '{os.path.basename(file_path)}'")

    def _clean_outliers(self) -> None:
        """Reject single-point coordinate spikes (e.g. OCR misread digit jumps)."""
        if len(self.records) < 3:
            return
        for i in range(1, len(self.records) - 1):
            prev_pt = self.records[i - 1]
            curr_pt = self.records[i]
            next_pt = self.records[i + 1]
            dt = max(0.5, abs(curr_pt["time"] - prev_pt["time"]))
            max_deg = 0.008 * dt
            # If current jumps dramatically from both previous and next, replace with midpoint
            if (abs(curr_pt["lat"] - prev_pt["lat"]) > max_deg and abs(curr_pt["lat"] - next_pt["lat"]) > max_deg) or \
               (abs(curr_pt["lon"] - prev_pt["lon"]) > max_deg and abs(curr_pt["lon"] - next_pt["lon"]) > max_deg):
                logger.warning(f"Sanitizing GPS spike at t={curr_pt['time']:.1f}s ({curr_pt['lat']:.6f}, {curr_pt['lon']:.6f})")
                curr_pt["lat"] = (prev_pt["lat"] + next_pt["lat"]) / 2.0
                curr_pt["lon"] = (prev_pt["lon"] + next_pt["lon"]) / 2.0

    def _parse_file(self, path: str) -> None:
        if not os.path.exists(path):
            logger.warning(f"Telemetry file '{path}' does not exist. Using static coordinates.")
            return

        ext = os.path.splitext(path)[1].lower()
        if ext == ".gpx":
            self._parse_gpx(path)
        elif ext == ".srt":
            self._parse_srt(path)
        else:
            self._parse_csv(path)

    def _parse_gpx(self, path: str) -> None:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Extract trkpt lat and lon attributes
        pattern = re.compile(r'<trkpt\s+lat="([0-9.-]+)"\s+lon="([0-9.-]+)"', re.IGNORECASE)
        matches = pattern.findall(content)
        sec = 0.0
        for lat_s, lon_s in matches:
            try:
                lat = float(lat_s)
                lon = float(lon_s)
                self.records.append({"time": sec, "lat": lat, "lon": lon})
                sec += 1.0 # default 1 Hz sampling
            except ValueError:
                continue

    def _parse_srt(self, path: str) -> None:
        """Parse dashcam SRT subtitles with embedded GPS coordinates."""
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        blocks = content.strip().split("\n\n")
        coord_pattern = re.compile(r'([0-9]{1,3}\.[0-9]{4,}),\s*([0-9]{1,3}\.[0-9]{4,})')
        time_pattern = re.compile(r'([0-9]{2}):([0-9]{2}):([0-9]{2})')

        for b in blocks:
            lines = b.splitlines()
            if len(lines) < 2:
                continue
            # Extract timestamp
            t_match = time_pattern.search(lines[1])
            sec = 0.0
            if t_match:
                h, m, s = map(int, t_match.groups())
                sec = h * 3600 + m * 60 + s

            # Extract lat lon
            text = " ".join(lines[2:])
            c_match = coord_pattern.search(text)
            if c_match:
                lat, lon = map(float, c_match.groups())
                self.records.append({"time": sec, "lat": lat, "lon": lon})

    def _parse_csv(self, path: str) -> None:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        sec = 0.0
        for line in lines:
            line = line.strip()
            if not line or line.lower().startswith(("lat", "time", "date")):
                continue
            parts = [p.strip() for p in line.split(",")]
            try:
                if len(parts) >= 3:
                    # format: time, lat, lon
                    t_val = float(parts[0]) if parts[0].replace(".", "", 1).isdigit() else sec
                    lat = float(parts[1])
                    lon = float(parts[2])
                    self.records.append({"time": t_val, "lat": lat, "lon": lon})
                    sec += 1.0
                elif len(parts) == 2:
                    lat = float(parts[0])
                    lon = float(parts[1])
                    self.records.append({"time": sec, "lat": lat, "lon": lon})
                    sec += 1.0
            except ValueError:
                continue

    def get_coordinate(self, timestamp_sec: float, total_duration_sec: float) -> Tuple[float, float, str]:
        if not self.records:
            return 21.2415, 81.6335, "Survey Area"

        # If records have sequential time, find closest
        closest = min(self.records, key=lambda r: abs(r["time"] - timestamp_sec))
        return closest["lat"], closest["lon"], f"Survey Track (t={timestamp_sec:.1f}s)"

    def get_route_coordinates(self) -> List[List[float]]:
        # MapLibre expects [[lon, lat], ...]
        return [[r["lon"], r["lat"]] for r in self.records]

    def get_mode_name(self) -> str:
        base = os.path.basename(self.file_path)
        return f"GPX FIELD SURVEY ({base})"


class LiveSerialSource(TelemetrySource):
    """
    Mode 1: Production AIS-140 Hardware GPS Stream
    Stubs serial/CAN NMEA stream reader for live fleet bus deployment.
    """

    def __init__(self, port: str = "COM3", baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.current_lat = 21.2415
        self.current_lon = 81.6335
        logger.info(f"LiveSerialSource initialized on port '{port}' (AIS-140 9600 baud)")

    def get_coordinate(self, timestamp_sec: float, total_duration_sec: float) -> Tuple[float, float, str]:
        # In physical deployment, reads live sentence $GPGGA from serial port
        return self.current_lat, self.current_lon, f"AIS-140 Hardware ({self.port})"

    def get_route_coordinates(self) -> List[List[float]]:
        return [[self.current_lon, self.current_lat]]

    def get_mode_name(self) -> str:
        return f"AIS-140 HARDWARE ({self.port})"


def auto_detect_gps_file(video_path: str) -> Optional[str]:
    """
    Checks if a matching .gpx, .srt, or .csv companion log exists
    for the given video file in the same directory.
    """
    if not video_path:
        return None
    base_no_ext, _ = os.path.splitext(video_path)
    for ext in [".gpx", ".srt", ".csv"]:
        candidate = base_no_ext + ext
        if os.path.exists(candidate):
            logger.info(f"🎯 Auto-detected matching GPS telemetry file: '{candidate}'")
            return candidate
    return None
