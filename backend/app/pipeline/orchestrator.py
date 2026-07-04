"""
10-Layer System Orchestrator
Matches the reference architecture for Autonomous Sensor Failure Recovery.
"""
import time
from typing import Any, Dict, List, Optional

from ..anomaly_detection import AnomalyDetector
from ..agentic_ai import AgentController
from ..fusion import SensorFusion
from ..predictive_maintenance import PredictiveMaintenance
from ..services.upload_storage import active_upload_context
from .knowledge_base import KnowledgeBase


LAYER_DEFINITIONS = [
    {"id": 1, "key": "sensor_layer", "name": "Sensor Layer (Input)", "module_type": "Input Module",
     "components": ["Camera RGB/Depth", "LiDAR Point Cloud", "Radar Objects", "GPS Location", "IMU Motion"]},
    {"id": 2, "key": "data_acquisition", "name": "Data Acquisition & Synchronization", "module_type": "Output Module",
     "components": ["Time sync", "Upload merge", "Frame alignment"]},
    {"id": 3, "key": "perception_fusion", "name": "Perception & Sensor Fusion Layer", "module_type": "Processing Module",
     "components": ["Preprocessing", "Feature Extraction", "Early/Late/Weighted Fusion"]},
    {"id": 4, "key": "health_monitoring", "name": "Sensor Health Monitoring & Anomaly Detection", "module_type": "Monitoring Module",
     "components": ["Health Monitoring", "Isolation Forest", "Autoencoder", "Anomaly Decision"]},
    {"id": 5, "key": "agentic_decision", "name": "Agentic AI Decision Module", "module_type": "Decision Module",
     "components": ["Failure Diagnosis", "Reasoning & Assessment", "Decision Making", "Learning"]},
    {"id": 6, "key": "recovery_manager", "name": "Recovery & Reconfiguration Manager", "module_type": "Processing Module",
     "components": ["Backup selection", "Fusion weight adjust", "Pipeline reconfigure"]},
    {"id": 7, "key": "redundancy_resilience", "name": "Redundancy & Resilience Layer", "module_type": "Resilience Module",
     "components": ["Backup activation", "Graceful degradation", "Fail-safe strategies"]},
    {"id": 8, "key": "planning_interface", "name": "Perception Output & Planning Interface", "module_type": "Output Module",
     "components": ["Object detection", "Tracking", "Localization", "Drivable area"]},
    {"id": 9, "key": "vehicle_control", "name": "Vehicle Control & Execution", "module_type": "Control Module",
     "components": ["Path planning", "Control commands", "Actuation"]},
    {"id": 10, "key": "monitoring_kb", "name": "Monitoring, Alerts & Knowledge Base", "module_type": "Monitoring Module",
     "components": ["Dashboard alerts", "Knowledge base", "Logs & analytics"]},
]


class SystemOrchestrator:
    """Runs the full 10-layer pipeline each simulation tick."""

    def __init__(
        self,
        anomaly_detector: AnomalyDetector,
        fusion_engine: SensorFusion,
        agent_controller: AgentController,
        predictive_maintenance: PredictiveMaintenance,
    ):
        self.anomaly_detector = anomaly_detector
        self.fusion_engine = fusion_engine
        self.agent_controller = agent_controller
        self.predictive_maintenance = predictive_maintenance
        self.knowledge_base = KnowledgeBase()
        self._layer_status: Dict[str, str] = {d["key"]: "idle" for d in LAYER_DEFINITIONS}
        self._active_path = "normal"  # normal | recovery

    def _layer(self, key: str, status: str, summary: str, extras: Optional[Dict] = None) -> Dict[str, Any]:
        defn = next(d for d in LAYER_DEFINITIONS if d["key"] == key)
        self._layer_status[key] = status
        return {
            "id": defn["id"],
            "key": key,
            "name": defn["name"],
            "module_type": defn["module_type"],
            "components": defn["components"],
            "status": status,
            "summary": summary,
            **(extras or {}),
        }

    def _preprocess(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Layer 3a — Preprocessing: filter, denoise, calibrate."""
        sensors = telemetry["sensors"]
        return {
            "camera_filtered": sensors["Camera"]["blur_metric"] > 1.0,
            "lidar_denoised": sensors["LiDAR"]["noise_level"] < 1.0,
            "radar_calibrated": sensors["Radar"]["snr"] > 0,
            "gps_valid": sensors["GPS"]["satellites"] > 0,
            "imu_stable": abs(sensors["IMU"]["accel_z"] + 9.81) < 1.0,
        }

    def _extract_features(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Layer 3b — Feature extraction."""
        s = telemetry["sensors"]
        return {
            "camera_cnn_proxy": s["Camera"]["detections"]["count"],
            "lidar_pointnet_proxy": s["LiDAR"]["point_count"],
            "radar_signal": s["Radar"]["snr"],
            "gps_position": [s["GPS"]["latitude"], s["GPS"]["longitude"]],
            "imu_motion": [s["IMU"]["accel_x"], s["IMU"]["accel_y"], s["IMU"]["yaw_rate"]],
        }

    def run_pipeline(
        self,
        raw_telemetry: Dict[str, Any],
        simulator_degradation: Dict[str, float],
        fusion_mode: str = "Weighted",
    ) -> Dict[str, Any]:
        t0 = time.time()
        layers: List[Dict[str, Any]] = []

        # ── Layer 1: Sensor Layer ──
        sensors = raw_telemetry.get("sensors", {})
        active_sensors = [k for k, v in sensors.items() if v.get("status") != "Offline"]
        layers.append(self._layer(
            "sensor_layer", "active",
            f"{len(active_sensors)} sensor streams live",
            {"active_sensors": active_sensors},
        ))

        # ── Layer 2: Data Acquisition & Synchronization ──
        telemetry = dict(raw_telemetry)
        cam_metrics = active_upload_context.get("camera_metrics")
        if cam_metrics and "Camera" in telemetry.get("sensors", {}):
            telemetry["sensors"]["Camera"]["brightness"] = int(cam_metrics.get("brightness", 128))
            telemetry["sensors"]["Camera"]["contrast"] = int(cam_metrics.get("contrast", 64))
            telemetry["sensors"]["Camera"]["blur_metric"] = float(cam_metrics.get("blur_metric", 15.0))
        telemetry["fusion_mode"] = fusion_mode
        telemetry["sync_timestamp"] = telemetry.get("timestamp", time.time())
        layers.append(self._layer(
            "data_acquisition", "active",
            "Sensor data synchronized and upload-enriched",
            {"upload_active": bool(active_upload_context.get("active_image_id"))},
        ))

        # ── Layer 3: Perception & Sensor Fusion (normal path) ──
        preprocess = self._preprocess(telemetry)
        features = self._extract_features(telemetry)
        layers.append(self._layer(
            "perception_fusion", "active",
            f"Features extracted; fusion mode: {fusion_mode}",
            {"preprocessing": preprocess, "features": features},
        ))

        # ── Layer 4: Health Monitoring & Anomaly Detection ──
        anomaly_results = self.anomaly_detector.analyze_frame(telemetry)
        is_anomalous = anomaly_results["is_anomalous"]
        self._active_path = "recovery" if is_anomalous else "normal"
        layers.append(self._layer(
            "health_monitoring",
            "alert" if is_anomalous else "active",
            f"Anomaly detected: {is_anomalous} — path: {self._active_path}",
            {
                "anomaly_detected": is_anomalous,
                "decision": "trigger_agent" if is_anomalous else "normal_operation",
                "failure_classification": anomaly_results.get("failure_classification", {}),
            },
        ))

        # ── Branch: Normal vs Recovery ──
        agent_results = None
        fusion_result = None

        if is_anomalous:
            # ── Layer 5: Agentic AI Decision ──
            agent_results = self.agent_controller.run_cycle(telemetry, anomaly_results)
            layers.append(self._layer(
                "agentic_decision", "active",
                agent_results.get("diagnose", "Processing"),
                {"cycle_id": agent_results.get("cycle_id"), "agent_steps": len(agent_results.get("agent_steps", []))},
            ))

            # ── Layer 6: Recovery & Reconfiguration ──
            reconfig = agent_results["reconfiguration"]
            layers.append(self._layer(
                "recovery_manager", "active",
                f"Pipeline: {reconfig['pipeline_before']} → {reconfig['pipeline_after']}",
                {"target_speed": reconfig["target_speed"], "weights_after": reconfig["weights_after"]},
            ))

            # ── Layer 7: Redundancy & Resilience ──
            active_pipeline = reconfig["active_pipeline"]
            backups_active = [s for s in active_pipeline.split(" + ") if s.strip()]
            layers.append(self._layer(
                "redundancy_resilience",
                "degraded" if "None" in active_pipeline else "active",
                f"Active backups: {', '.join(backups_active) or 'fail-safe stop'}",
                {"graceful_degradation": "None" not in active_pipeline, "active_backups": backups_active},
            ))

            fusion_result = agent_results["fusion_result"]
        else:
            # Normal operation — fusion without agent reconfiguration
            health = anomaly_results["sensor_health"]
            fusion_result = self.fusion_engine.fuse(telemetry["sensors"], health, mode=fusion_mode)
            layers.append(self._layer("agentic_decision", "idle", "Normal operation — agent standby"))
            layers.append(self._layer("recovery_manager", "idle", "No reconfiguration required"))
            layers.append(self._layer("redundancy_resilience", "active", "Full redundancy available — all sensors nominal"))

            agent_results = {
                "cycle_id": None,
                "observe": "Normal operation path.",
                "analyze": "All sensors within thresholds.",
                "diagnose": "All sensors normal.",
                "reasoning": "Perception pipeline operating normally.",
                "plan": "Maintain default pipeline.",
                "act": "No recovery action.",
                "monitor": f"Fusion confidence: {fusion_result['fusion_confidence']:.2f}",
                "verify": {"verification_passed": True, "summary": "Normal path verified."},
                "learn": "No new patterns.",
                "agent_steps": [],
                "active_step": "observe",
                "recovery_status": "nominal",
                "reconfiguration": {
                    "pipeline_before": "Camera + LiDAR + Radar + GPS + IMU",
                    "pipeline_after": "Camera + LiDAR + Radar + GPS + IMU",
                    "weights_before": "{}",
                    "weights_after": "{}",
                    "active_pipeline": "Camera + LiDAR + Radar + GPS + IMU",
                    "target_speed": telemetry["vehicle_state"]["speed"],
                    "safety_score": fusion_result["fusion_confidence"] * 100,
                    "risk_score": 100 - fusion_result["fusion_confidence"] * 100,
                    "system_confidence": fusion_result["fusion_confidence"],
                    "recovery_status": "nominal",
                },
                "fusion_result": fusion_result,
            }

        reconfig = agent_results["reconfiguration"]

        # ── Layer 8: Perception Output & Planning Interface ──
        gt = telemetry.get("ground_truth", {})
        layers.append(self._layer(
            "planning_interface", "active",
            f"Obstacle at {gt.get('distance_to_obstacle', -1):.1f}m — fused {fusion_result['fused_distance']:.1f}m",
            {
                "fused_distance": fusion_result["fused_distance"],
                "fusion_confidence": fusion_result["fusion_confidence"],
                "obstacle_distance": gt.get("distance_to_obstacle"),
            },
        ))

        # ── Layer 9: Vehicle Control & Execution ──
        target_speed = reconfig["target_speed"]
        layers.append(self._layer(
            "vehicle_control", "active",
            f"Target speed: {target_speed:.2f} m/s — actuation engaged",
            {"target_speed": target_speed, "current_speed": telemetry["vehicle_state"]["speed"]},
        ))

        # ── Layer 10: Monitoring, Alerts & Knowledge Base ──
        predictive_results = {}
        for sensor in ["Camera", "LiDAR", "Radar", "GPS", "IMU"]:
            failure_mode = telemetry["sensors"][sensor].get("failure_mode", "None")
            deg = simulator_degradation.get(sensor, 0.05)
            predictive_results[sensor] = self.predictive_maintenance.compute_metrics(sensor, deg, failure_mode)
        self.predictive_maintenance.step()

        if is_anomalous:
            for sensor, val in anomaly_results.get("statistical_anomalies", {}).items():
                self.knowledge_base.learn_failure(sensor, val["type"], reconfig.get("active_pipeline", ""))
            self.knowledge_base.record_event({
                "type": "anomaly_recovery",
                "diagnose": agent_results.get("diagnose"),
                "pipeline": reconfig.get("active_pipeline"),
            })

        layers.append(self._layer(
            "monitoring_kb", "active" if is_anomalous else "idle",
            f"KB patterns: {len(self.knowledge_base.failure_patterns)} — alerts: {is_anomalous}",
            {"knowledge_base": self.knowledge_base.get_summary()},
        ))

        elapsed_ms = round((time.time() - t0) * 1000, 2)

        return {
            "telemetry": telemetry,
            "anomaly_results": anomaly_results,
            "agent_results": agent_results,
            "fusion_result": fusion_result,
            "reconfig": reconfig,
            "predictive_results": predictive_results,
            "architecture": {
                "layers": layers,
                "active_path": self._active_path,
                "pipeline_elapsed_ms": elapsed_ms,
            },
        }
