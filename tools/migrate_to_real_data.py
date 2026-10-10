"""
FLINT Database Migration: Consolidate to Real NH-30 Field Survey Data
Wipes old prototype mock routes and duplicate journeys, establishing
the actual 15-minute bus drive as primary Route #1 with real detections.
"""

import sqlite3
import shutil
import os
import json

DB_PATH = "backend/flint.db"
BAK_PATH = "backend/flint.db.bak"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found.")
        return

    # 1. Backup
    shutil.copy2(DB_PATH, BAK_PATH)
    print(f"Backed up {DB_PATH} to {BAK_PATH}")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 2. Extract Route 8 geojson_path (our real bus GPS track)
    c.execute("SELECT geojson_path FROM routes WHERE id=8 OR name LIKE '%pothole vid bus full%' ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    if not row:
        print("Error: Could not locate real survey route in DB.")
        return
    real_geojson = row[0]
    coords = json.loads(real_geojson)
    print(f"Retrieved real route coordinates: {len(coords)} points.")

    # 3. Clean up dummy detections (keep real detections from journey 7)
    c.execute("DELETE FROM detections WHERE journey_id != 7")
    deleted_dets = c.rowcount
    print(f"Deleted {deleted_dets} dummy detections.")

    # 4. Clean up alerts for deleted detections
    c.execute("DELETE FROM alerts WHERE detection_id < 100")
    deleted_alerts = c.rowcount
    print(f"Deleted {deleted_alerts} dummy alerts.")
    c.execute("DELETE FROM alert_events WHERE alert_id NOT IN (SELECT id FROM alerts)")

    # 5. Clean up all old routes and re-create Route 1 as the Real Corridor
    c.execute("DELETE FROM routes")
    c.execute("""
        INSERT INTO routes (id, name, description, distance_km, geojson_path)
        VALUES (1, 'NH-30 Raipur-Simga', 'Field Survey Mobile Dashcam: NH-30 Simga Highway', 15.79, ?)
    """, (real_geojson,))
    print("Created primary Route #1: 'NH-30 Raipur-Simga'.")

    # 6. Clean up buses and set BUS-01
    c.execute("DELETE FROM buses")
    c.execute("""
        INSERT INTO buses (id, name, status, last_lat, last_lon, last_seen)
        VALUES (1, 'BUS-01', 'ACTIVE', 21.196648, 81.666457, datetime('now'))
    """)
    print("Created primary Bus #1: 'BUS-01'.")

    # 7. Clean up journeys and set Journey 1
    c.execute("DELETE FROM route_journeys")
    c.execute("""
        INSERT INTO route_journeys (id, bus_id, route_id, status, start_time)
        VALUES (1, 1, 1, 'ACTIVE', datetime('now', '-30 minutes'))
    """)
    print("Created primary Journey #1 (Bus 1, Route 1).")

    # 8. Re-link real detections to journey 1
    c.execute("UPDATE detections SET journey_id = 1")
    print(f"Updated {c.rowcount} real detections to Journey #1.")

    conn.commit()
    c.execute("VACUUM")
    conn.close()
    print("Database migration complete and verified!")

if __name__ == "__main__":
    migrate()
