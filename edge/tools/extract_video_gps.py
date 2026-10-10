"""
FLINT Video GPS Extractor
Reads on-screen GPS Map Camera overlays from MP4 dashcam videos,
extracts second-by-second GNSS coordinates, and outputs standardized
GPX 1.1 and CSV survey files ready for the FLINT ingestion pipeline.
"""

import os
import re
import cv2
import time
import argparse
import datetime
from typing import List, Tuple, Optional
import easyocr
import numpy as np

def parse_gps_from_text(text: str) -> Optional[Tuple[float, float]]:
    """
    Parses latitude and longitude from raw OCR text string.
    Handles 'Lat 21.134192 Long 81.665805', 'Lat: 21.13...', etc.
    """
    # Pattern 1: Explicit Lat/Long keywords
    m = re.search(r'Lat\s*[:\s]?\s*([0-9]+\.[0-9]+).*?Long?\s*[:\s]?\s*([0-9]+\.[0-9]+)', text, re.IGNORECASE)
    if m:
        try:
            lat = float(m.group(1))
            lon = float(m.group(2))
            if 5.0 <= lat <= 40.0 and 65.0 <= lon <= 100.0:  # Valid India bounding box
                return lat, lon
        except ValueError:
            pass

    # Pattern 2: Decimal pair matching India coordinates (Lat 20-23, Lon 80-84 for Central India)
    decimals = re.findall(r'(\d{2}\.\d{4,8})', text)
    if len(decimals) >= 2:
        try:
            for i in range(len(decimals) - 1):
                c1, c2 = float(decimals[i]), float(decimals[i+1])
                if 15.0 <= c1 <= 28.0 and 75.0 <= c2 <= 88.0:
                    return c1, c2
        except ValueError:
            pass

    return None

def extract_gps(
    video_path: str,
    interval_sec: float = 1.0,
    max_seconds: Optional[float] = None,
    output_gpx: Optional[str] = None,
    output_csv: Optional[str] = None,
    use_gpu: bool = True,
) -> str:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    base_name, _ = os.path.splitext(video_path)
    gpx_path = output_gpx or f"{base_name}.gpx"
    csv_path = output_csv or f"{base_name}.csv"

    print(f"[*] Opening video: {video_path}")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = total_frames / fps
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"[*] Video specs: {w}x{h} @ {fps:.1f} FPS | Total Duration: {duration_sec:.1f}s ({duration_sec/60:.1f} min)")

    print(f"[*] Initializing EasyOCR engine (GPU={use_gpu})...")
    reader = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)

    frame_step = max(1, int(round(fps * interval_sec)))
    target_frames = range(0, total_frames, frame_step)
    if max_seconds:
        target_frames = [f for f in target_frames if (f / fps) <= max_seconds]

    print(f"[*] Extracting GPS across {len(target_frames)} sampled intervals (1 frame every {interval_sec}s)...")

    records: List[dict] = []
    last_known_lat = 21.134192
    last_known_lon = 81.665805
    consecutive_missing = 0
    t0 = time.time()

    for idx, f_idx in enumerate(target_frames):
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap.read()
        if not ret:
            break

        timestamp_sec = round(f_idx / fps, 2)

        # Crop the bottom HUD card containing the GPS Map Camera text box
        # Box is located in bottom region: y: 65% to 95%, x: 30% to 85%
        crop = frame[int(h * 0.65):int(h * 0.95), int(w * 0.30):int(w * 0.85)]

        # Preprocessing: convert to grayscale for OCR speed
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        results = reader.readtext(gray)
        raw_text = " ".join([r[1] for r in results])

        parsed = parse_gps_from_text(raw_text)
        if parsed:
            c_lat, c_lon = parsed
            # Physical velocity sanity check (vehicle cannot jump > 150 km/h / ~0.005 deg/sec)
            dt = max(0.5, timestamp_sec - records[-1]["timestamp_sec"]) if records else 1.0
            max_deg = 0.005 * dt
            if (last_known_lat != 0.0 or last_known_lon != 0.0) and (abs(c_lat - last_known_lat) > max_deg or abs(c_lon - last_known_lon) > max_deg):
                # Outlier jump detected (e.g. OCR single digit error) -> reject and keep last known
                lat, lon = last_known_lat, last_known_lon
                is_interpolated = True
            else:
                lat, lon = c_lat, c_lon
                last_known_lat, last_known_lon = lat, lon
                consecutive_missing = 0
                is_interpolated = False
        else:
            lat, lon = last_known_lat, last_known_lon
            consecutive_missing += 1
            is_interpolated = True

        records.append({
            "timestamp_sec": timestamp_sec,
            "lat": lat,
            "lon": lon,
            "interpolated": is_interpolated,
            "raw_text": raw_text[:50] if parsed else "NO_GPS"
        })

        if idx % 15 == 0 or idx == len(target_frames) - 1:
            rate = (idx + 1) / (time.time() - t0 + 1e-6)
            pct = ((idx + 1) / len(target_frames)) * 100
            print(f"    [{pct:5.1f}%] Frame {f_idx} (t={timestamp_sec:6.1f}s) -> Lat: {lat:.6f}, Lon: {lon:.6f} ({rate:.1f} frames/s)")

    cap.release()
    elapsed = time.time() - t0
    print(f"[*] Extraction complete in {elapsed:.1f}s across {len(records)} points.")

    # Write CSV
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("timestamp_sec,lat,lon,interpolated\n")
        for r in records:
            f.write(f"{r['timestamp_sec']:.2f},{r['lat']:.6f},{r['lon']:.6f},{1 if r['interpolated'] else 0}\n")
    print(f"[+] Saved CSV trace: {csv_path}")

    # Write GPX 1.1
    start_dt = datetime.datetime.now(datetime.timezone.utc)
    with open(gpx_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<gpx version="1.1" creator="FLINT Urban Sense GPS Extractor" xmlns="http://www.topografix.com/GPX/1/1">\n')
        f.write(f'  <metadata><name>{os.path.basename(video_path)}</name></metadata>\n')
        f.write('  <trk>\n')
        f.write(f'    <name>Field Survey - {os.path.basename(video_path)}</name>\n')
        f.write('    <trkseg>\n')
        for r in records:
            pt_time = start_dt + datetime.timedelta(seconds=r["timestamp_sec"])
            iso_t = pt_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            f.write(f'      <trkpt lat="{r["lat"]:.6f}" lon="{r["lon"]:.6f}">\n')
            f.write(f'        <time>{iso_t}</time>\n')
            f.write('      </trkpt>\n')
        f.write('    </trkseg>\n')
        f.write('  </trk>\n')
        f.write('</gpx>\n')
    print(f"[+] Saved GPX trace: {gpx_path}")

    # Summary
    if records:
        print(f"===========================================================")
        print(f"  Start Coordinate:  {records[0]['lat']:.6f}, {records[0]['lon']:.6f}")
        print(f"  End Coordinate:    {records[-1]['lat']:.6f}, {records[-1]['lon']:.6f}")
        print(f"  Total Trackpoints: {len(records)}")
        print(f"===========================================================")

    return gpx_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FLINT Video GPS Extractor")
    parser.add_argument("--video", default="edge/pothole vid bus full.mp4", help="Path to input video")
    parser.add_argument("--interval", type=float, default=1.0, help="Sampling interval in seconds (default: 1.0)")
    parser.add_argument("--max-seconds", type=float, default=None, help="Stop after N seconds of video")
    parser.add_argument("--cpu", action="store_true", help="Force CPU inference instead of GPU")
    args = parser.parse_args()

    extract_gps(
        video_path=args.video,
        interval_sec=args.interval,
        max_seconds=args.max_seconds,
        use_gpu=not args.cpu,
    )
