import json
import random
import time
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from models import BusStatus, JourneyStatus, Severity, DetectionType, AlertStatus
from routing import get_osrm_driving_route

# Recreate the database tables
models.Base.metadata.drop_all(bind=engine)
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Raipur Key Transit Corridors (Start -> Waypoints -> End)
ROUTE_DEFINITIONS = [
    {
        "name": "R1",
        "desc": "Naya Raipur Express",
        "waypoints": [
            (81.6296, 21.2514),  # Raipur Railway Station
            (81.6780, 21.2380),  # Telibandha Chowk
            (81.7833, 21.1610),  # Mantralaya Naya Raipur
        ]
    },
    {
        "name": "R2",
        "desc": "Pandri - Tatibandh Corridor",
        "waypoints": [
            (81.6560, 21.2580),  # Pandri City Center
            (81.6370, 21.2460),  # Ghadi Chowk
            (81.5650, 21.2550),  # Tatibandh Chowk
        ]
    },
    {
        "name": "R3",
        "desc": "GE Road Corridor",
        "waypoints": [
            (81.5650, 21.2580),  # Tatibandh / AIIMS
            (81.6000, 21.2430),  # NIT Raipur / GE Road
            (81.6335, 21.2415),  # Jaistambh Chowk
            (81.6780, 21.2380),  # Telibandha Marine Drive
        ]
    },
    {
        "name": "R4",
        "desc": "Shankar Nagar Circuit",
        "waypoints": [
            (81.6680, 21.2620),  # Shankar Nagar
            (81.6480, 21.2520),  # Lodhi Para
            (81.6296, 21.2514),  # Raipur Junction
        ]
    },
    {
        "name": "R5",
        "desc": "VIP Road Airport Link",
        "waypoints": [
            (81.6780, 21.2380),  # Telibandha Marine Drive
            (81.6850, 21.2310),  # Magneto The Mall
            (81.7450, 21.1820),  # Swami Vivekananda Airport
        ]
    }
]

def seed_data():
    print("Fetching real road-network routes from OSRM for Raipur...")
    
    routes = []
    route_coords_map = {}

    for r_def in ROUTE_DEFINITIONS:
        print(f"  -> Routing {r_def['name']}: {r_def['desc']} via OSRM...")
        osrm_data = get_osrm_driving_route(r_def["waypoints"])
        
        if osrm_data:
            coords = osrm_data["coordinates"]
            dist_km = osrm_data["distance_km"]
            print(f"     [OK] Snapped to road network: {len(coords)} points, {dist_km} km")
        else:
            # Fallback interpolation if network fails
            coords = [[lon, lat] for lon, lat in r_def["waypoints"]]
            dist_km = 12.0
            print(f"     [WARN] Fallback to direct waypoints")

        route = models.Route(
            name=r_def["name"],
            description=r_def["desc"],
            distance_km=dist_km,
            geojson_path=json.dumps(coords)
        )
        db.add(route)
        routes.append(route)
        route_coords_map[r_def["name"]] = coords
        time.sleep(0.3)  # Gentle rate limit for OSRM public API

    db.commit()

    # Create buses with locations snapped to their route
    buses = []
    for i in range(1, 7):
        assigned_route_name = f"R{(i % 5) + 1}"
        coords = route_coords_map.get(assigned_route_name, [[81.6296, 21.2514]])
        # Pick a point on the road
        sample_pt = coords[len(coords) // 2] if coords else [81.6296, 21.2514]
        
        bus = models.Bus(
            name=f"BUS-{i:02d}",
            status=models.BusStatus.ACTIVE if i in [1, 2, 5, 6] else (models.BusStatus.IDLE if i == 4 else models.BusStatus.ACTIVE),
            last_lon=sample_pt[0],
            last_lat=sample_pt[1],
            last_seen=datetime.now(timezone.utc)
        )
        db.add(bus)
        buses.append(bus)
    db.commit()

    # Create Completed Journey for BUS-03 on R3 (GE Road)
    bus_3 = db.query(models.Bus).filter(models.Bus.name == "BUS-03").first()
    route_3 = db.query(models.Route).filter(models.Route.name == "R3").first()
    r3_coords = route_coords_map.get("R3", [])

    bus_3.status = BusStatus.ACTIVE
    if r3_coords:
        bus_3.last_lon = r3_coords[-1][0]
        bus_3.last_lat = r3_coords[-1][1]

    now = datetime.now(timezone.utc)
    completed_journey = models.RouteJourney(
        bus_id=bus_3.id,
        route_id=route_3.id,
        status=JourneyStatus.COMPLETED,
        start_time=now - timedelta(minutes=35),
        end_time=now - timedelta(minutes=2)
    )
    db.add(completed_journey)
    db.commit()

    # Place Detections EXACTLY along the road polyline of R3
    detection_types = [
        (DetectionType.ROAD_DEFECT, Severity.MEDIUM, "/evidence/pothole_01.jpg"),
        (DetectionType.ROAD_DEFECT, Severity.HIGH, "/evidence/pothole_02.jpg"),
        (DetectionType.TRAFFIC, Severity.MEDIUM, "/evidence/traffic_01.jpg"),
        (DetectionType.SAFETY, Severity.HIGH, "/evidence/safety_01.jpg"),
        (DetectionType.ROAD_BLOCKAGE, Severity.CRITICAL, "/evidence/obstruction_01.jpg"),
        (DetectionType.ROAD_DEFECT, Severity.LOW, "/evidence/pothole_01.jpg"),
        (DetectionType.SAFETY, Severity.MEDIUM, "/evidence/safety_01.jpg"),
    ]

    total_pts = len(r3_coords)
    if total_pts > 15:
        # Sample evenly spaced indices along the road
        indices = sorted(random.sample(range(5, total_pts - 5), min(13, total_pts - 10)))
    else:
        indices = list(range(len(r3_coords)))

    from services.cost_service import compute_defect_cost

    for idx in indices:
        pt = r3_coords[idx]
        dtype, sev, ev_url = random.choice(detection_types)
        
        calc = compute_defect_cost(
            area_sq_m=round(random.uniform(0.3, 3.2), 2),
            severity=sev.value,
            defect_type=dtype.value
        )

        det = models.Detection(
            journey_id=completed_journey.id,
            type=dtype,
            confidence=round(random.uniform(0.85, 0.98), 3),
            lon=pt[0],
            lat=pt[1],
            severity=sev,
            evidence_url=ev_url,
            timestamp=completed_journey.start_time + timedelta(minutes=random.randint(5, 30)),
            estimated_area_sq_m=calc["estimated_area_sq_m"],
            severity_tier=calc["severity_tier"],
            repair_method=calc["repair_method"],
            estimated_cost=calc["estimated_cost"]
        )
        db.add(det)

        if sev in [Severity.CRITICAL, Severity.HIGH]:
            db.commit()
            db.refresh(det)

            status = AlertStatus.NEW if sev == Severity.CRITICAL else (
                AlertStatus.ACKNOWLEDGED if random.random() > 0.4 else AlertStatus.NEW
            )

            alert = models.Alert(
                detection_id=det.id,
                title=f"{dtype.value.replace('_', ' ')} DETECTED",
                type=dtype.value,
                severity=sev.value,
                status=status.value,
                timestamp=det.timestamp
            )
            db.add(alert)

    db.commit()
    print("Database successfully seeded with real OSRM road-network routes and road-snapped detections!")

if __name__ == "__main__":
    seed_data()
