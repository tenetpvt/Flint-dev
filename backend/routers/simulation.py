from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import asyncio
import random
from datetime import datetime, timezone

import models
import schemas
from database import get_db, SessionLocal

router = APIRouter()

class SimulationManager:
    def __init__(self):
        self.is_running = False
        self.step_index = 0
        self.bus_name = "BUS-01"
        self.route_name = "NH-30"

sim_manager = SimulationManager()

@router.get("/status")
def get_simulation_status():
    return {
        "is_running": sim_manager.is_running,
        "step_index": sim_manager.step_index,
        "bus_name": sim_manager.bus_name,
        "route_name": sim_manager.route_name,
        "status_label": "RUNNING" if sim_manager.is_running else "PAUSED"
    }

@router.post("/toggle")
def toggle_simulation():
    sim_manager.is_running = not sim_manager.is_running
    return {
        "is_running": sim_manager.is_running,
        "status_label": "RUNNING" if sim_manager.is_running else "PAUSED"
    }

@router.post("/trigger-alert")
def trigger_critical_alert(db: Session = Depends(get_db)):
    # Find active journey or create one
    journey = db.query(models.RouteJourney).filter(models.RouteJourney.status == models.JourneyStatus.COMPLETED).first()
    if not journey:
        journey = db.query(models.RouteJourney).first()

    if not journey:
        raise HTTPException(status_code=400, detail="No journey available to attach alert to.")

    # Create new Detection
    now = datetime.now(timezone.utc)
    det = models.Detection(
        journey_id=journey.id,
        type=models.DetectionType.ROAD_BLOCKAGE,
        confidence=0.98,
        lat=21.1966,
        lon=81.6664,
        severity=models.Severity.CRITICAL,
        evidence_url="/evidence/obstruction_01.jpg",
        timestamp=now
    )
    db.add(det)
    db.commit()
    db.refresh(det)

    alert = models.Alert(
        detection_id=det.id,
        title="EMERGENCY: MAJOR ROAD OBSTRUCTION",
        type=models.DetectionType.ROAD_BLOCKAGE,
        severity=models.Severity.CRITICAL,
        status=models.AlertStatus.NEW,
        timestamp=now
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    return {
        "status": "TRIGGERED",
        "alert_id": alert.id,
        "title": alert.title,
        "severity": alert.severity.name
    }

import time
from sse import sse_manager

@router.get("/stream")
async def simulation_sse_stream():
    client_queue = sse_manager.subscribe()

    async def event_generator():
        try:
            init_msg = json.dumps({"type": "CONNECTION_ESTABLISHED", "status": "CONNECTED"})
            yield f"data: {init_msg}\n\n"

            last_telemetry_time = 0.0
            while True:
                # 1. Drain any pending real-time events from the sse_manager queue
                while not client_queue.empty():
                    msg = client_queue.get_nowait()
                    yield msg

                # 2. Emit periodic bus telemetry ONLY if simulation is running AND no real edge stream is active
                now = time.time()
                if sim_manager.is_running and not sse_manager.is_edge_active() and (now - last_telemetry_time >= 2.0):
                    last_telemetry_time = now
                    db = SessionLocal()
                    try:
                        primary_route = db.query(models.Route).first()
                        if primary_route and primary_route.geojson_path:
                            coords = json.loads(primary_route.geojson_path)
                            total_pts = len(coords)
                            sim_manager.step_index = (sim_manager.step_index + 1) % total_pts
                            cur_pt = coords[sim_manager.step_index]

                            # Update bus coordinates in DB
                            bus = db.query(models.Bus).first()
                            if bus:
                                bus.last_lon = cur_pt[0]
                                bus.last_lat = cur_pt[1]
                                bus.last_seen = datetime.now(timezone.utc)
                                db.commit()

                            payload = {
                                "type": "BUS_TELEMETRY",
                                "bus": bus.name if bus else "BUS-01",
                                "route": primary_route.name if primary_route else "NH-30",
                                "coordinates": cur_pt,
                                "step": sim_manager.step_index,
                                "total_steps": total_pts,
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                            yield f"data: {json.dumps(payload)}\n\n"
                    finally:
                        db.close()

                # 3. Wait up to 0.25s for immediate live events, or timeout to cycle loop
                try:
                    item = await asyncio.wait_for(client_queue.get(), timeout=0.25)
                    yield item
                except asyncio.TimeoutError:
                    pass

        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unsubscribe(client_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
