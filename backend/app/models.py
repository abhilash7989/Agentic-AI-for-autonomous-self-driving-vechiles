from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean, Text
from datetime import datetime
from .database import Base

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Vehicle parameters
    vehicle_speed = Column(Float)
    vehicle_heading = Column(Float)
    distance_to_obstacle = Column(Float)
    safety_score = Column(Float)
    risk_score = Column(Float)
    system_confidence = Column(Float)

    # Sensor Health Scores
    camera_health = Column(Float)
    lidar_health = Column(Float)
    radar_health = Column(Float)
    gps_health = Column(Float)
    imu_health = Column(Float)

    # Active Fusion weights
    camera_weight = Column(Float)
    lidar_weight = Column(Float)
    radar_weight = Column(Float)
    gps_weight = Column(Float)
    imu_weight = Column(Float)

    # Active pipeline configuration description
    active_pipeline = Column(String(100))
    fusion_mode = Column(String(50))  # "Early", "Late", "Weighted"

class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    sensor_name = Column(String(50), index=True)  # "Camera", "LiDAR", etc.
    anomaly_type = Column(String(100))  # "Blur", "Blackout", "Drift", etc.
    anomaly_score = Column(Float)
    confidence_score = Column(Float)
    severity = Column(String(20))  # "Low", "Medium", "High", "Critical"
    status = Column(String(20))  # "Active", "Recovered"
    resolved_at = Column(DateTime, nullable=True)

class AgentAction(Base):
    __tablename__ = "agent_actions"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # OADRPAL Fields
    observe_state = Column(Text)
    analyze_state = Column(Text)
    diagnose_state = Column(Text)
    reasoning_text = Column(Text)
    plan_state = Column(Text)
    act_state = Column(Text)
    monitor_state = Column(Text)
    learn_state = Column(Text)
    
    # Configuration changes applied
    pipeline_before = Column(String(100))
    pipeline_after = Column(String(100))
    weights_before = Column(String(100))
    weights_after = Column(String(100))
    is_successful = Column(Boolean, default=True)

class PredictiveMetrics(Base):
    __tablename__ = "predictive_metrics"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    sensor_name = Column(String(50), index=True)
    estimated_rul = Column(Float)  # Remaining Useful Life in hours
    failure_probability = Column(Float)  # 0 to 1
    risk_level = Column(String(20))  # "Low", "Medium", "High", "Critical"
    early_warning_generated = Column(Boolean, default=False)


class SensorUpload(Base):
    __tablename__ = "sensor_uploads"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    upload_type = Column(String(20), index=True)  # image | video | csv
    sensor_type = Column(String(20), index=True)  # Camera | LiDAR | Radar | GPS | IMU | multi
    filename = Column(String(255))
    storage_path = Column(String(500))
    frame_count = Column(Integer, default=0)
    metadata_json = Column(Text)


class AgentStepLogRecord(Base):
    __tablename__ = "agent_step_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    cycle_id = Column(String(36), index=True)
    step_name = Column(String(20), index=True)  # observe | analyze | diagnose | plan | act | verify
    inputs_json = Column(Text)
    outputs_json = Column(Text)
    duration_ms = Column(Float, default=0.0)
