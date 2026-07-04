from typing import Any, Dict, List


class KnowledgeBase:
    """Layer 10 — stores failure patterns, recovery policies, and decision logs."""

    def __init__(self):
        self.failure_patterns: List[Dict[str, Any]] = []
        self.recovery_policies: Dict[str, str] = {
            "Camera": "Failover to LiDAR + Radar for obstacle ranging",
            "LiDAR": "Failover to Camera + Radar depth estimation",
            "Radar": "Failover to LiDAR + Camera velocity proxy",
            "GPS": "Dead-reckoning via IMU integration",
            "IMU": "GPS-aided attitude correction",
        }
        self.decision_log: List[Dict[str, Any]] = []

    def record_event(self, event: Dict[str, Any]):
        self.decision_log.append(event)
        if len(self.decision_log) > 200:
            self.decision_log = self.decision_log[-200:]

    def learn_failure(self, sensor: str, fault: str, recovery_action: str):
        pattern = {"sensor": sensor, "fault": fault, "recovery": recovery_action}
        if pattern not in self.failure_patterns:
            self.failure_patterns.append(pattern)

    def get_summary(self) -> Dict[str, Any]:
        return {
            "failure_patterns_count": len(self.failure_patterns),
            "recovery_policies": self.recovery_policies,
            "recent_decisions": self.decision_log[-5:],
        }
