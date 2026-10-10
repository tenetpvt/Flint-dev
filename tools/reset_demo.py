"""
FLINT Demo Reset Tool (One-Click Slate Cleaner for Live Presentations)
Resets all detections, alerts, and evidence crops back to 0 while keeping
the NH-30 Raipur-Simga corridor intact and positioning BUS-01 at the start.
"""

import sqlite3
import os
import glob
import json
from datetime import datetime, timezone

import sqlite3
import os
import sys
import glob
import json
from datetime import datetime, timezone

# Add tools directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DB_PATH = "backend/flint.db"
EVIDENCE_DIR = "edge/evidence_crops"

def reset_demo():
    print(">>> [FLINT DEMO RESET] Preparing fresh live presentation slate...")

    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 1. Fetch start coordinate from Route 1
    c.execute("SELECT geojson_path FROM routes WHERE id=1")
    row = c.fetchone()
    if row and row[0]:
        try:
            coords = json.loads(row[0])
            start_lon, start_lat = coords[0]
        except Exception:
            start_lon, start_lat = 81.665989, 21.134134
    else:
        start_lon, start_lat = 81.665989, 21.134134

    # 2. Reset Bus 1 position to start of route
    c.execute("""
        UPDATE buses 
        SET status='ACTIVE', last_lat=?, last_lon=?, last_seen=datetime('now')
        WHERE id=1
    """, (start_lat, start_lon))

    # 3. Clear detections, alerts, and events
    c.execute("DELETE FROM alert_events")
    c.execute("DELETE FROM alerts")
    c.execute("DELETE FROM detections")
    try:
        c.execute("DELETE FROM sqlite_sequence WHERE name IN ('detections', 'alerts', 'alert_events')")
    except sqlite3.OperationalError:
        pass

    # 4. Reset Journey 1
    c.execute("""
        UPDATE route_journeys
        SET status='ACTIVE', start_time=datetime('now'), end_time=NULL
        WHERE id=1
    """)

    conn.commit()
    c.execute("VACUUM")
    conn.close()
    print("[OK] Database cleared: 0 detections, 0 alerts. Bus reset to start of NH-30.")

    # 5. Clear old evidence crops
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    crop_files = glob.glob(os.path.join(EVIDENCE_DIR, "evt_*.jpg"))
    for f in crop_files:
        try:
            os.remove(f)
        except Exception:
            pass
    print(f"[OK] Cleared {len(crop_files)} cached evidence crops from {EVIDENCE_DIR}.")

    # 6. Re-sync frontend mockData.ts so initial state is clean 0
    try:
        from sync_frontend_mock_data import generate_mock_data
        generate_mock_data()
        print("[OK] Frontend mockData.ts synchronized to 0 detections.")
    except Exception as e:
        print(f"Notice on frontend sync: {e}")

    print("\n[READY FOR JUDGES] FLINT is in a clean slate: 0 findings. Launch .\\run_edge.ps1 to demo live!")

if __name__ == "__main__":
    reset_demo()
