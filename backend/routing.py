import urllib.request
import json
from typing import List, Tuple, Optional

def get_osrm_driving_route(coordinates: List[Tuple[float, float]]) -> Optional[dict]:
    """
    Fetches exact road-snapped geometry and distance from OSRM.
    coordinates: List of (lon, lat) tuples.
    Returns dict with { 'coordinates': [[lon, lat], ...], 'distance_km': float, 'duration_min': float }
    """
    try:
        # Format: lon1,lat1;lon2,lat2;...
        coord_str = ";".join([f"{lon:.6f},{lat:.6f}" for lon, lat in coordinates])
        url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
        
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'FlintUrbanPlatform/1.0'}
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                if data.get("code") == "Ok" and len(data.get("routes", [])) > 0:
                    route = data["routes"][0]
                    coords = route["geometry"]["coordinates"]
                    dist_km = round(route["distance"] / 1000.0, 2)
                    dur_min = round(route["duration"] / 60.0, 1)
                    return {
                        "coordinates": coords,
                        "distance_km": dist_km,
                        "duration_min": dur_min
                    }
    except Exception as e:
        print(f"OSRM routing error: {e}")
    
    return None
