from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from models import BusStatus, JourneyStatus, Severity, DetectionType, AlertStatus

class BusBase(BaseModel):
    name: str
    status: BusStatus
    last_lat: Optional[float] = None
    last_lon: Optional[float] = None

class Bus(BusBase):
    id: int
    last_seen: datetime
    class Config:
        from_attributes = True

class RouteBase(BaseModel):
    name: str
    description: str
    distance_km: float
    geojson_path: str

class Route(RouteBase):
    id: int
    class Config:
        from_attributes = True

class RouteCreate(RouteBase):
    pass

class SurveyRouteCreate(BaseModel):
    name: str
    description: Optional[str] = "Dynamic field survey route"
    distance_km: Optional[float] = 1.0
    coordinates: List[List[float]] # [[lon, lat], ...]
    bus_name: Optional[str] = "BUS-03"

class EdgeTelemetryCreate(BaseModel):
    bus_name: Optional[str] = "BUS-03"
    route_name: Optional[str] = "R3"
    lat: float
    lon: float
    speed_kmh: Optional[float] = 35.0
    video_timestamp_sec: Optional[float] = None

class DetectionBase(BaseModel):
    type: DetectionType
    confidence: float
    lat: float
    lon: float
    severity: Severity
    evidence_url: Optional[str] = None
    video_timestamp_sec: Optional[float] = None
    # Cost & Budget Repair Fields
    estimated_area_sq_m: Optional[float] = None
    severity_tier: Optional[str] = None
    repair_method: Optional[str] = None
    estimated_cost: Optional[float] = None

class DetectionCreate(DetectionBase):
    journey_id: int

class Detection(DetectionBase):
    id: int
    journey_id: int
    timestamp: datetime
    class Config:
        from_attributes = True

class UnitRatesConfig(BaseModel):
    cold_mix_rate_sq_m: float = 1200.0
    hot_mix_rate_sq_m: float = 2800.0
    full_depth_rate_sq_m: float = 6500.0
    mobilization_overhead: float = 1500.0

class CostEstimationSummary(BaseModel):
    route_id: Optional[int] = None
    route_name: Optional[str] = "All Routes"
    total_estimated_cost: float
    total_defects: int
    critical_backlog_cost: float
    estimated_asphalt_metric_tons: float
    estimated_cold_mix_bags: int
    cost_by_severity: List[dict]
    cost_by_repair_method: List[dict]

class JourneyBase(BaseModel):
    bus_id: int
    route_id: int
    status: JourneyStatus

class RouteJourney(JourneyBase):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    class Config:
        from_attributes = True

class AlertEvent(BaseModel):
    id: int
    alert_id: int
    status: AlertStatus
    timestamp: datetime
    note: Optional[str] = None
    class Config:
        from_attributes = True

class AlertBase(BaseModel):
    title: str
    type: DetectionType
    severity: Severity
    status: AlertStatus

class Alert(AlertBase):
    id: int
    detection_id: int
    timestamp: datetime
    events: List[AlertEvent] = []
    class Config:
        from_attributes = True

# Responses
class AlertWithDetails(Alert):
    detection: Detection

class JourneyWithDetails(RouteJourney):
    bus: Bus
    route: Route
    detections: List[Detection] = []

class AnalyticsSummary(BaseModel):
    active_buses: int
    completed_routes: int
    total_findings: int
    reports_pending: int
    live_alerts: int
