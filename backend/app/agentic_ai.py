from typing import Dict, Any
from .fusion import SensorFusion
from .services.agent_pipeline import AgentState, execute_agent_cycle


class AgentController:
    def __init__(self, fusion_engine: SensorFusion):
        self.fusion_engine = fusion_engine
        self._state = AgentState()

        self.redundancy_map = {
            "Camera": ["LiDAR", "Radar"],
            "LiDAR": ["Camera", "Radar"],
            "Radar": ["LiDAR", "Camera"],
            "GPS": ["IMU", "LiDAR"],
            "IMU": ["GPS"],
        }

        self.failure_knowledge = {
            "Camera_Blackout": {
                "severity": "Critical",
                "impact": "Lane detection, traffic light classification, and close-range pedestrian detection completely unavailable.",
            },
            "Camera_Blur": {
                "severity": "High",
                "impact": "Reduced accuracy in object detection bounding boxes. False negatives likely under low contrast.",
            },
            "Camera_Freeze": {
                "severity": "Critical",
                "impact": "Obstacle detection frozen. Highly dangerous due to static environment illusion.",
            },
            "LiDAR_Blackout": {
                "severity": "Critical",
                "impact": "3D spatial profiling completely lost. Depth perception degraded.",
            },
            "LiDAR_Sparse": {
                "severity": "Medium",
                "impact": "Sparse point clouds decrease resolution of distant objects. Potential lag in classification.",
            },
            "LiDAR_Noise": {
                "severity": "High",
                "impact": "High spatial noise may lead to phantom obstacle detections and emergency braking.",
            },
            "Radar_Signal Loss": {
                "severity": "High",
                "impact": "Target speed and acceleration tracking of lead vehicle lost. ACC disabled.",
            },
            "Radar_Corruption": {
                "severity": "Medium",
                "impact": "Ghost reflections may cause path planning confusion.",
            },
            "GPS_Loss": {
                "severity": "Critical",
                "impact": "Global path tracking and high-definition map registration unavailable.",
            },
            "GPS_Drift": {
                "severity": "High",
                "impact": "Incorrect vehicle localization on map, risk of lane deviation mapping errors.",
            },
            "IMU_Drift": {
                "severity": "High",
                "impact": "Dead reckoning coordinates integration accumulates severe error. Attitude estimation compromised.",
            },
        }

    @property
    def learned_failures(self):
        return self._state.learned_failures

    @property
    def last_pipeline(self):
        return self._state.last_pipeline

    @property
    def last_weights(self):
        return self._state.last_weights

    def run_cycle(self, telemetry: Dict[str, Any], anomaly_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes Observe → Analyze → Diagnose → Plan → Act → Verify
        plus legacy OADRPAL fields (reasoning, monitor, learn).
        """
        return execute_agent_cycle(
            self.fusion_engine,
            self.redundancy_map,
            self.failure_knowledge,
            self._state,
            telemetry,
            anomaly_analysis,
        )
