"""
FLINT Municipal Pothole Repair Cost Estimation Service
Implements baseline municipal rate calculation based on CPWD/State PWD Schedule of Rates (SoR).
Formula:
  Repair Cost = (Area sq.m * Depth Severity Factor * Unit Material Rate) + Mobilization Overhead
"""

import math
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
import models

# Standard Municipal Baseline Rates (in INR ₹)
DEFAULT_UNIT_RATES = {
    "cold_mix_rate_sq_m": 1200.0,      # ₹1,200 per sq.m (shallow patches < 25mm)
    "hot_mix_rate_sq_m": 2800.0,       # ₹2,800 per sq.m (standard 40-50mm wearing course)
    "full_depth_rate_sq_m": 6500.0,    # ₹6,500 per sq.m (deep base + sub-base reconstruction)
    "mobilization_overhead": 1500.0,   # ₹1,500 per site mobilization overhead
}

# Current in-memory rates (modifiable via API)
_active_rates = dict(DEFAULT_UNIT_RATES)

def get_active_rates() -> Dict[str, float]:
    return dict(_active_rates)

def update_active_rates(new_rates: Dict[str, float]) -> Dict[str, float]:
    global _active_rates
    for k in DEFAULT_UNIT_RATES:
        if k in new_rates and new_rates[k] is not None and new_rates[k] > 0:
            _active_rates[k] = float(new_rates[k])
    return dict(_active_rates)

def reset_to_default_rates() -> Dict[str, float]:
    global _active_rates
    _active_rates = dict(DEFAULT_UNIT_RATES)
    return dict(_active_rates)

def compute_defect_cost(
    area_sq_m: Optional[float] = None,
    severity: str = "MEDIUM",
    defect_type: str = "ROAD_DEFECT",
    custom_rates: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Computes dimensions, severity tier, repair technique, material quantities,
    and estimated cost in INR for a detected road defect.
    """
    rates = custom_rates or _active_rates
    sev = str(severity).upper().replace("SEVERITY.", "")

    # If area is not provided, estimate based on severity heuristic
    if area_sq_m is None or area_sq_m <= 0:
        if sev == "LOW":
            area_sq_m = 0.35
        elif sev == "MEDIUM":
            area_sq_m = 0.85
        elif sev == "HIGH":
            area_sq_m = 1.80
        elif sev == "CRITICAL":
            area_sq_m = 2.90
        else:
            area_sq_m = 0.75

    area_sq_m = round(float(area_sq_m), 2)

    # Determine Severity Tier, Depth Factor, Repair Technique and Unit Rate
    if sev == "CRITICAL" or area_sq_m >= 2.5:
        severity_tier = "Tier 4 - Sub-base Structural Failure"
        repair_method = "Full-Depth Excavation"
        unit_rate = rates.get("full_depth_rate_sq_m", DEFAULT_UNIT_RATES["full_depth_rate_sq_m"])
        depth_factor = 2.20
        depth_m = 0.10  # 100mm depth
    elif sev == "HIGH" or area_sq_m >= 1.2:
        severity_tier = "Tier 3 - Deep Crater Fatigue"
        repair_method = "Hot-Mix Asphalt"
        unit_rate = rates.get("hot_mix_rate_sq_m", DEFAULT_UNIT_RATES["hot_mix_rate_sq_m"])
        depth_factor = 1.80
        depth_m = 0.06  # 60mm depth
    elif sev == "MEDIUM" or area_sq_m >= 0.5:
        severity_tier = "Tier 2 - Moderate Surface Pothole"
        repair_method = "Hot-Mix Asphalt"
        unit_rate = rates.get("hot_mix_rate_sq_m", DEFAULT_UNIT_RATES["hot_mix_rate_sq_m"])
        depth_factor = 1.40
        depth_m = 0.04  # 40mm depth
    else:
        severity_tier = "Tier 1 - Minor Surface Deterioration"
        repair_method = "Cold-Mix Patch"
        unit_rate = rates.get("cold_mix_rate_sq_m", DEFAULT_UNIT_RATES["cold_mix_rate_sq_m"])
        depth_factor = 1.00
        depth_m = 0.025 # 25mm depth

    mobilization = rates.get("mobilization_overhead", DEFAULT_UNIT_RATES["mobilization_overhead"])

    # Formula: (Area * Depth Factor * Unit Rate) + Mobilization Overhead
    raw_cost = (area_sq_m * depth_factor * unit_rate) + mobilization
    # Round to nearest 50 rupees
    estimated_cost = float(round(raw_cost / 50.0) * 50)

    # Material Projections:
    # Compacted Bulk Density of Asphalt is ~2.35 metric tons per m3
    compacted_density_t_per_m3 = 2.35
    volume_m3 = area_sq_m * depth_m
    asphalt_metric_tons = round(volume_m3 * compacted_density_t_per_m3, 2)
    # Cold mix 25kg bags: ~2 bags per 0.5 m2 patch
    cold_mix_bags = math.ceil(area_sq_m * 4)

    return {
        "estimated_area_sq_m": area_sq_m,
        "severity_tier": severity_tier,
        "repair_method": repair_method,
        "estimated_cost": estimated_cost,
        "asphalt_metric_tons": asphalt_metric_tons,
        "cold_mix_bags": cold_mix_bags,
        "unit_rate_applied": unit_rate,
        "depth_factor": depth_factor,
        "mobilization_overhead": mobilization,
    }


def get_route_cost_summary(
    db: Session,
    route_id: Optional[int] = None,
    custom_rates: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Computes aggregate repair budget, defect breakdown, critical backlog,
    and material projections across a given route or all routes.
    """
    rates = custom_rates or _active_rates
    query = db.query(models.Detection).join(models.RouteJourney)

    route_name = "All Routes"
    if route_id is not None and route_id > 0:
        query = query.filter(models.RouteJourney.route_id == route_id)
        route_obj = db.query(models.Route).filter(models.Route.id == route_id).first()
        if route_obj:
            route_name = f"{route_obj.name} - {route_obj.description}"

    detections = query.all()

    total_cost = 0.0
    critical_backlog_cost = 0.0
    total_asphalt_tons = 0.0
    total_cold_mix_bags = 0

    cost_by_severity = {
        "CRITICAL": {"count": 0, "cost": 0.0, "color": "#f87171"},
        "HIGH": {"count": 0, "cost": 0.0, "color": "#fb923c"},
        "MEDIUM": {"count": 0, "cost": 0.0, "color": "#facc15"},
        "LOW": {"count": 0, "cost": 0.0, "color": "#4ade80"},
    }

    cost_by_method = {
        "Full-Depth Excavation": {"count": 0, "cost": 0.0, "color": "#ef4444"},
        "Hot-Mix Asphalt": {"count": 0, "cost": 0.0, "color": "#f97316"},
        "Cold-Mix Patch": {"count": 0, "cost": 0.0, "color": "#38bdf8"},
    }

    total_defects = len(detections)

    for d in detections:
        sev_str = str(d.severity).upper().replace("SEVERITY.", "")
        if sev_str not in cost_by_severity:
            sev_str = "MEDIUM"

        area = d.estimated_area_sq_m
        cost = d.estimated_cost
        method = d.repair_method

        # If detection was not pre-calculated or rates changed, recompute
        if not cost or not method:
            calc = compute_defect_cost(area, sev_str, d.type, rates)
            cost = calc["estimated_cost"]
            method = calc["repair_method"]
            asphalt_tons = calc["asphalt_metric_tons"]
            bags = calc["cold_mix_bags"]
        else:
            calc = compute_defect_cost(area, sev_str, d.type, rates)
            asphalt_tons = calc["asphalt_metric_tons"]
            bags = calc["cold_mix_bags"]

        total_cost += cost
        total_asphalt_tons += asphalt_tons
        total_cold_mix_bags += bags

        if sev_str in ["CRITICAL", "HIGH"]:
            critical_backlog_cost += cost

        cost_by_severity[sev_str]["count"] += 1
        cost_by_severity[sev_str]["cost"] += cost

        if method not in cost_by_method:
            cost_by_method[method] = {"count": 0, "cost": 0.0, "color": "#a855f7"}
        cost_by_method[method]["count"] += 1
        cost_by_method[method]["cost"] += cost

    severity_list = [
        {"severity": k, "label": f"{k.capitalize()} Priority", "count": v["count"], "cost": round(v["cost"], 2), "color": v["color"]}
        for k, v in cost_by_severity.items()
    ]

    method_list = [
        {"method": k, "count": v["count"], "cost": round(v["cost"], 2), "color": v["color"]}
        for k, v in cost_by_method.items()
    ]

    return {
        "route_id": route_id,
        "route_name": route_name,
        "total_estimated_cost": round(total_cost, 2),
        "total_defects": total_defects,
        "critical_backlog_cost": round(critical_backlog_cost, 2),
        "estimated_asphalt_metric_tons": round(total_asphalt_tons, 2),
        "estimated_cold_mix_bags": total_cold_mix_bags,
        "cost_by_severity": severity_list,
        "cost_by_repair_method": method_list,
        "active_unit_rates": rates,
    }


def get_route_boq(
    db: Session,
    route_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Returns an itemized Bill of Quantities (BOQ) list of defects for the route.
    """
    query = db.query(models.Detection).join(models.RouteJourney)
    if route_id is not None and route_id > 0:
        query = query.filter(models.RouteJourney.route_id == route_id)

    detections = query.order_by(desc(models.Detection.timestamp)).all()
    boq_items = []

    for d in detections:
        journey = d.journey
        route = journey.route if journey else None
        route_name = route.name if route else "NH-30"
        route_desc = route.description if route else "Transit Highway"

        sev_str = str(d.severity).upper().replace("SEVERITY.", "")
        area = d.estimated_area_sq_m
        cost = d.estimated_cost
        tier = d.severity_tier
        method = d.repair_method

        if not cost or not method:
            calc = compute_defect_cost(area, sev_str, d.type)
            area = calc["estimated_area_sq_m"]
            cost = calc["estimated_cost"]
            tier = calc["severity_tier"]
            method = calc["repair_method"]

        # Approximate chainage using journey ID and detection ID offset
        chainage_km = round(((d.id * 0.47) % max(1.0, (route.distance_km if route and route.distance_km else 12.0))), 2)

        boq_items.append({
            "id": d.id,
            "journey_id": d.journey_id,
            "route_id": route.id if route else None,
            "route_name": route_name,
            "route_description": route_desc,
            "chainage_km": chainage_km,
            "location_label": f"KM {chainage_km} · {route_name}",
            "lat": d.lat,
            "lon": d.lon,
            "type": d.type,
            "confidence": d.confidence,
            "severity": sev_str,
            "severity_tier": tier,
            "estimated_area_sq_m": area,
            "repair_method": method,
            "estimated_cost": cost,
            "evidence_url": d.evidence_url,
            "timestamp": d.timestamp.isoformat() if d.timestamp else "",
            "video_timestamp_sec": d.video_timestamp_sec,
        })

    return boq_items
