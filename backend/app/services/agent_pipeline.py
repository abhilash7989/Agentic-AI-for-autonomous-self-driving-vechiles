import json
import time
from typing import Any, Dict, List
from uuid import uuid4

from ..schemas.agent_schemas import AgentStepLog, VerifyResult
from ..fusion import SensorFusion


class AgentState:
    """Mutable state carried across agent cycles."""

    def __init__(self):
        self.last_pipeline = "Camera + LiDAR + Radar + GPS + IMU"
        self.last_weights: Dict[str, float] = {}
        self.learned_failures: List[str] = []
        self.previous_recovery_status = "nominal"


def _step_log(step: str, cycle_id: str, inputs: Dict, outputs: Dict, t0: float) -> AgentStepLog:
    return AgentStepLog(
        step=step,
        timestamp=time.time(),
        cycle_id=cycle_id,
        inputs=inputs,
        outputs=outputs,
        duration_ms=round((time.time() - t0) * 1000, 2),
    )


def _compute_recovery_status(
    failed_sensors: List[str],
    degraded_sensors: List[str],
    verification_passed: bool,
    previous: str,
) -> str:
    if len(failed_sensors) >= 2 or (failed_sensors and not verification_passed):
        return "critical"
    if failed_sensors:
        return "degraded"
    if degraded_sensors:
        return "recovering" if previous in ("degraded", "critical") else "degraded"
    if previous in ("degraded", "recovering", "critical") and verification_passed:
        return "recovering"
    return "nominal"


def execute_agent_cycle(
    fusion_engine: SensorFusion,
    redundancy_map: Dict[str, List[str]],
    failure_knowledge: Dict[str, Dict[str, str]],
    state: AgentState,
    telemetry: Dict[str, Any],
    anomaly_analysis: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Runs Observe → Analyze → Diagnose → Plan → Act → Verify.
    Returns legacy OADRPAL string fields plus structured agent_steps[].
    """
    cycle_id = str(uuid4())
    agent_steps: List[Dict[str, Any]] = []

    sensor_data = telemetry["sensors"]
    health_scores = anomaly_analysis["sensor_health"]
    stats_anomalies = anomaly_analysis["statistical_anomalies"]
    ml_anomalies = anomaly_analysis["ml_anomalies"]

    # --- OBSERVE ---
    t0 = time.time()
    observe_inputs = {
        "sensor_count": 5,
        "vehicle_speed": telemetry["vehicle_state"]["speed"],
        "distance_to_obstacle": telemetry["ground_truth"]["distance_to_obstacle"],
    }
    observe_outputs = {
        "sensor_health": health_scores,
        "statistical_anomaly_count": len(stats_anomalies),
        "ml_anomaly_detected": ml_anomalies["detected"],
        "ml_scores": {
            "isolation_forest": ml_anomalies.get("isolation_forest_score", 0.0),
            "autoencoder_mse": ml_anomalies.get("autoencoder_mse", 0.0),
        },
        "summary": (
            f"Observed 5 active sensor streams. Speed: {telemetry['vehicle_state']['speed']:.2f} m/s. "
            f"Ground truth distance: {telemetry['ground_truth']['distance_to_obstacle']:.2f}m. "
            f"Statistical anomaly count: {len(stats_anomalies)}. "
            f"ML Anomaly Flag: {ml_anomalies['detected']}."
        ),
    }
    agent_steps.append(_step_log("observe", cycle_id, observe_inputs, observe_outputs, t0).to_dict())
    observe_summary = observe_outputs["summary"]

    # --- ANALYZE ---
    t0 = time.time()
    degraded_sensors: List[str] = []
    failed_sensors: List[str] = []
    for s, score in health_scores.items():
        if score < 15.0:
            failed_sensors.append(s)
        elif score < 80.0:
            degraded_sensors.append(s)

    analyze_outputs = {
        "failed_sensors": failed_sensors,
        "degraded_sensors": degraded_sensors,
        "health_scores": health_scores,
        "summary": (
            f"Detected {len(failed_sensors)} failed sensors {failed_sensors} and "
            f"{len(degraded_sensors)} degraded sensors {degraded_sensors}."
        ),
    }
    agent_steps.append(
        _step_log("analyze", cycle_id, {"sensor_health": health_scores}, analyze_outputs, t0).to_dict()
    )
    analyze_summary = analyze_outputs["summary"]

    # --- DIAGNOSE ---
    t0 = time.time()
    diagnoses: List[Dict[str, str]] = []
    highest_severity = "Low"

    for sensor, details in stats_anomalies.items():
        sig_key = f"{sensor}_{details['type']}"
        kb_entry = failure_knowledge.get(
            sig_key, {"severity": "Medium", "impact": "Degraded perception quality."}
        )
        confidence = anomaly_analysis["sensor_confidence"].get(sensor, 1.0)
        diagnoses.append({
            "sensor": sensor,
            "fault": details["type"],
            "severity": kb_entry["severity"],
            "impact": kb_entry["impact"],
            "confidence": round(confidence, 3),
        })
        if kb_entry["severity"] == "Critical" or highest_severity == "Critical":
            highest_severity = "Critical"
        elif kb_entry["severity"] == "High" and highest_severity != "Critical":
            highest_severity = "High"
        elif kb_entry["severity"] == "Medium" and highest_severity not in ("Critical", "High"):
            highest_severity = "Medium"

    diagnose_summary = (
        "; ".join(f"{d['sensor']} {d['fault']} ({d['severity']})" for d in diagnoses)
        or "All sensors normal."
    )
    diagnose_outputs = {
        "diagnoses": diagnoses,
        "highest_severity": highest_severity,
        "summary": diagnose_summary,
    }
    agent_steps.append(
        _step_log(
            "diagnose",
            cycle_id,
            {"statistical_anomalies": stats_anomalies},
            diagnose_outputs,
            t0,
        ).to_dict()
    )

    # --- REASON (legacy field, embedded in diagnose context) ---
    reasoning_list: List[str] = []
    if not diagnoses:
        reasoning_list.append(
            "All sensors operating within normal parameters. System confidence is optimal."
        )
    else:
        for d in diagnoses:
            reasoning_list.append(
                f"{d['sensor']} diagnosed with {d['fault']} (Severity: {d['severity']}). {d['impact']}"
            )
        if len(failed_sensors) >= 2:
            reasoning_list.append(
                "Multiple critical sensor failures detected. Primary and secondary perception "
                "channels compromised. Safe headway preservation requires immediate fallback."
            )
            highest_severity = "Critical"
    reasoning_summary = " ".join(reasoning_list)

    # --- PLAN ---
    t0 = time.time()
    plan_actions: List[str] = []
    target_speed = telemetry["vehicle_state"]["speed"]

    if not failed_sensors and not degraded_sensors:
        plan_actions.append("Maintain default perception pipeline.")
        plan_actions.append("Maintain baseline cruising speed (13.89 m/s).")
        target_speed = 13.89
    else:
        for failed in failed_sensors:
            backups = redundancy_map.get(failed, [])
            active_backups = [b for b in backups if health_scores[b] > 50]
            if active_backups:
                plan_actions.append(
                    f"Disable failed {failed} sensor. Activate failover mapping to backup: {active_backups[0]}."
                )
            else:
                plan_actions.append(
                    f"Disable failed {failed} sensor. No healthy backup available in redundancy map."
                )
        if highest_severity == "Critical":
            if len(failed_sensors) >= 2:
                plan_actions.append(
                    "Trigger Emergency Safe Stop Protocol: decelerate to hazard speed (3.0 m/s) "
                    "and engage hazard signals."
                )
                target_speed = 3.0
            else:
                plan_actions.append("Reduce target speed to 6.0 m/s due to critical sensor failure.")
                target_speed = 6.0
        elif highest_severity == "High":
            plan_actions.append("Reduce target speed to 9.0 m/s for precautionary safety margins.")
            target_speed = 9.0
        elif highest_severity == "Medium":
            plan_actions.append("Maintain standard velocity (13.89 m/s) with minor fusion weight tuning.")
            target_speed = 13.89

    plan_summary = " -> ".join(plan_actions)
    plan_outputs = {
        "actions": plan_actions,
        "target_speed": target_speed,
        "highest_severity": highest_severity,
        "summary": plan_summary,
    }
    agent_steps.append(
        _step_log(
            "plan",
            cycle_id,
            {"failed_sensors": failed_sensors, "degraded_sensors": degraded_sensors},
            plan_outputs,
            t0,
        ).to_dict()
    )

    # --- ACT ---
    t0 = time.time()
    new_weights = fusion_engine.default_priorities.copy()

    for s in failed_sensors:
        new_weights[s] = 0.0

    for s in degraded_sensors:
        current_health = health_scores[s] / 100.0
        new_weights[s] = fusion_engine.default_priorities[s] * current_health
        backups = redundancy_map.get(s, [])
        for backup in backups:
            if backup not in failed_sensors and backup not in degraded_sensors:
                new_weights[backup] = min(1.0, new_weights[backup] + 0.15)

    fusion_engine.update_active_weights(new_weights)

    active_sensors = [s for s, w in new_weights.items() if w > 0.15 and health_scores[s] > 15]
    active_pipeline_name = " + ".join(active_sensors) if active_sensors else "None (Manual Stop)"

    act_summary = (
        f"Applied new weights to fusion engine. Target vehicle speed adjusted to {target_speed:.2f} m/s. "
        f"Active pipeline reconfigured to: {active_pipeline_name}."
    )
    act_outputs = {
        "weights_applied": new_weights,
        "target_speed": target_speed,
        "active_pipeline": active_pipeline_name,
        "summary": act_summary,
    }
    agent_steps.append(
        _step_log("act", cycle_id, {"plan_actions": plan_actions}, act_outputs, t0).to_dict()
    )

    # --- VERIFY (maps to legacy monitor) ---
    t0 = time.time()
    fusion_result = fusion_engine.fuse(
        sensor_data, health_scores, mode=telemetry.get("fusion_mode", "Weighted")
    )
    system_confidence = fusion_result["fusion_confidence"]

    safety_score = system_confidence * 100.0
    ground_truth_dist = telemetry["ground_truth"]["distance_to_obstacle"]
    if ground_truth_dist < 20.0 and telemetry["vehicle_state"]["speed"] > 5.0:
        safety_score = max(10.0, safety_score - (20.0 - ground_truth_dist) * 4)

    risk_score = 100.0 - safety_score
    verification_passed = system_confidence >= 0.4 and len(failed_sensors) < 2

    recovery_status = _compute_recovery_status(
        failed_sensors, degraded_sensors, verification_passed, state.previous_recovery_status
    )
    state.previous_recovery_status = recovery_status

    verify_summary = (
        f"Verification {'PASSED' if verification_passed else 'FAILED'}. "
        f"Fused distance: {fusion_result['fused_distance']}m. "
        f"System Confidence: {system_confidence:.2f}. Safety Score: {safety_score:.1f}%. "
        f"Recovery status: {recovery_status}."
    )
    verify_result = VerifyResult(
        verification_passed=verification_passed,
        fusion_confidence=system_confidence,
        safety_score=round(safety_score, 2),
        risk_score=round(risk_score, 2),
        recovery_status=recovery_status,
        fused_distance=fusion_result["fused_distance"],
        summary=verify_summary,
    )
    verify_outputs = verify_result.model_dump()
    agent_steps.append(
        _step_log(
            "verify",
            cycle_id,
            {"weights_applied": new_weights, "active_pipeline": active_pipeline_name},
            verify_outputs,
            t0,
        ).to_dict()
    )
    monitor_summary = verify_summary

    # --- LEARN (legacy) ---
    learn_summary = "No new signature learned. System operational model is stable."
    if failed_sensors:
        for s in failed_sensors:
            sig = f"{s}_failed"
            if sig not in state.learned_failures:
                state.learned_failures.append(sig)
                learn_summary = (
                    f"Learned new failure signature: {sig}. Added to memory cache to speed up "
                    "subsequent diagnostic triggers."
                )

    pipeline_before = state.last_pipeline
    pipeline_after = active_pipeline_name
    state.last_pipeline = active_pipeline_name

    weights_before_str = json.dumps(state.last_weights)
    weights_after_str = json.dumps(new_weights)
    state.last_weights = new_weights

    return {
        "cycle_id": cycle_id,
        "observe": observe_summary,
        "analyze": analyze_summary,
        "diagnose": diagnose_summary,
        "reasoning": reasoning_summary,
        "plan": plan_summary,
        "act": act_summary,
        "monitor": monitor_summary,
        "verify": verify_outputs,
        "learn": learn_summary,
        "agent_steps": agent_steps,
        "active_step": "verify",
        "recovery_status": recovery_status,
        "reconfiguration": {
            "pipeline_before": pipeline_before,
            "pipeline_after": pipeline_after,
            "weights_before": weights_before_str,
            "weights_after": weights_after_str,
            "active_pipeline": active_pipeline_name,
            "target_speed": target_speed,
            "safety_score": safety_score,
            "risk_score": risk_score,
            "system_confidence": system_confidence,
            "recovery_status": recovery_status,
        },
        "fusion_result": fusion_result,
    }
