from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from database import Base

class BusStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    IDLE = "IDLE"
    MAINTENANCE = "MAINTENANCE"

class JourneyStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    PAUSED = "PAUSED"

class Severity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class DetectionType(str, enum.Enum):
    ROAD_DEFECT = "ROAD_DEFECT"
    TRAFFIC = "TRAFFIC"
    SAFETY = "SAFETY"
    INCIDENT = "INCIDENT"
    ROAD_BLOCKAGE = "ROAD_BLOCKAGE"

class AlertStatus(str, enum.Enum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    INVESTIGATING = "INVESTIGATING"
    RESOLVED = "RESOLVED"

class Bus(Base):
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    status = Column(String, default=BusStatus.IDLE)
    last_lat = Column(Float, nullable=True)
    last_lon = Column(Float, nullable=True)
    last_seen = Column(DateTime, default=datetime.utcnow)

    journeys = relationship("RouteJourney", back_populates="bus")

class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # e.g., R3
    description = Column(String) # e.g., GE Road Corridor
    # Storing GeoJSON line string as JSON string or WKT. We'll use simple JSON string for SQLite compatibility
    geojson_path = Column(String) 
    distance_km = Column(Float, default=0.0)

    journeys = relationship("RouteJourney", back_populates="route")

class RouteJourney(Base):
    __tablename__ = "route_journeys"

    id = Column(Integer, primary_key=True, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"))
    route_id = Column(Integer, ForeignKey("routes.id"))
    status = Column(String, default=JourneyStatus.ACTIVE)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)

    bus = relationship("Bus", back_populates="journeys")
    route = relationship("Route", back_populates="journeys")
    detections = relationship("Detection", back_populates="journey")

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(Integer, ForeignKey("route_journeys.id"))
    type = Column(String)
    confidence = Column(Float)
    lat = Column(Float)
    lon = Column(Float)
    severity = Column(String)
    evidence_url = Column(String, nullable=True)
    video_timestamp_sec = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Cost & Budget Repair Fields
    estimated_area_sq_m = Column(Float, nullable=True)
    severity_tier = Column(String, nullable=True)
    repair_method = Column(String, nullable=True)
    estimated_cost = Column(Float, nullable=True)

    journey = relationship("RouteJourney", back_populates="detections")
    alert = relationship("Alert", back_populates="detection", uselist=False)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    detection_id = Column(Integer, ForeignKey("detections.id"))
    title = Column(String)
    type = Column(String)
    severity = Column(String)
    status = Column(String, default=AlertStatus.NEW)
    timestamp = Column(DateTime, default=datetime.utcnow)

    detection = relationship("Detection", back_populates="alert")
    events = relationship("AlertEvent", back_populates="alert", cascade="all, delete-orphan")

class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"))
    status = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    note = Column(String, nullable=True)

    alert = relationship("Alert", back_populates="events")
