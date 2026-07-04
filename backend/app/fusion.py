import numpy as np
from typing import Dict, Any, Tuple

class SensorFusion:
    def __init__(self):
        # Default weights representing sensor accuracy under clear conditions
        self.default_priorities = {
            "Camera": 0.8,
            "LiDAR": 1.0,
            "Radar": 0.6,
            "GPS": 0.2,
            "IMU": 0.1
        }
        
        # Active weights which the agent can dynamically adjust
        self.active_weights = self.default_priorities.copy()

    def fuse(self, sensors: Dict[str, Any], health_scores: Dict[str, float], mode: str = "Weighted") -> Dict[str, Any]:
        """
        Fuses inputs from Camera, LiDAR, and Radar to estimate obstacle distance,
        and GPS/IMU to estimate location confidence.
        Modes: "Early", "Late", "Weighted"
        """
        # 1. Extract distances per sensor (with fallbacks if invalid)
        # Camera distance: derived from detection confidence or geometric bounding box size
        cam_detect = sensors["Camera"]["detections"]["obstacle"]
        if cam_detect["confidence"] > 0.0:
            # Reconstruct distance from bounding box size if available
            bbox = cam_detect["bbox"]
            if len(bbox) == 4:
                height = bbox[2] - bbox[0]
                cam_dist = max(5.0, 3000.0 / height) if height > 0 else 100.0
            else:
                cam_dist = 50.0
        else:
            cam_dist = -1.0 # Invalid
            
        # LiDAR distance
        lidar_dist = sensors["LiDAR"]["detected_distance"]
        
        # Radar distance
        radar_dist = sensors["Radar"]["detected_distance"]
        
        # 2. Apply Fusion Strategy
        fused_distance = 0.0
        fusion_confidence = 1.0
        active_sensor_count = 0
        
        if mode == "Early":
            # Early Fusion: Combine raw point/bbox features first.
            # We construct a concatenated feature array and do a weighted average.
            features = []
            weights = []
            if cam_dist > 0 and health_scores["Camera"] > 15:
                features.append(cam_dist)
                weights.append(0.35)
            if lidar_dist > 0 and health_scores["LiDAR"] > 15:
                features.append(lidar_dist)
                weights.append(0.45)
            if radar_dist > 0 and health_scores["Radar"] > 15:
                features.append(radar_dist)
                weights.append(0.20)
                
            if len(features) > 0:
                fused_distance = float(np.average(features, weights=weights))
                # Early fusion confidence is high if all features are present
                fusion_confidence = float(np.mean([health_scores[s]/100.0 for s in ["Camera", "LiDAR", "Radar"]]))
            else:
                fused_distance = -1.0
                fusion_confidence = 0.0
                
        elif mode == "Late":
            # Late Fusion: Average output distance predictions from each model.
            predictions = []
            if cam_dist > 0 and health_scores["Camera"] > 15:
                predictions.append(cam_dist)
            if lidar_dist > 0 and health_scores["LiDAR"] > 15:
                predictions.append(lidar_dist)
            if radar_dist > 0 and health_scores["Radar"] > 15:
                predictions.append(radar_dist)
                
            if len(predictions) > 0:
                fused_distance = float(np.mean(predictions))
                fusion_confidence = float(np.mean([health_scores[s]/100.0 for s in ["Camera", "LiDAR", "Radar"] if health_scores[s] > 15]))
            else:
                fused_distance = -1.0
                fusion_confidence = 0.0
                
        else: # Weighted Fusion (Default)
            # Dynamically calculate weights based on active weights (from Agent) and current health scores
            weights = {}
            for sensor in ["Camera", "LiDAR", "Radar"]:
                health = health_scores[sensor] / 100.0  # 0 to 1
                # If health is very low, force weight to 0.0
                if health < 0.15:
                    weights[sensor] = 0.0
                else:
                    weights[sensor] = self.active_weights[sensor] * health
            
            # Normalize weights
            sum_weights = sum(weights.values())
            if sum_weights > 0:
                normalized_weights = {k: v / sum_weights for k, v in weights.items()}
                
                features = []
                w_list = []
                
                if cam_dist > 0 and normalized_weights["Camera"] > 0:
                    features.append(cam_dist)
                    w_list.append(normalized_weights["Camera"])
                    active_sensor_count += 1
                if lidar_dist > 0 and normalized_weights["LiDAR"] > 0:
                    features.append(lidar_dist)
                    w_list.append(normalized_weights["LiDAR"])
                    active_sensor_count += 1
                if radar_dist > 0 and normalized_weights["Radar"] > 0:
                    features.append(radar_dist)
                    w_list.append(normalized_weights["Radar"])
                    active_sensor_count += 1
                    
                if len(features) > 0:
                    fused_distance = float(np.average(features, weights=w_list))
                    
                    # Compute a system confidence based on active weights sum and average active health
                    active_healths = [health_scores[s]/100.0 for s in ["Camera", "LiDAR", "Radar"] if health_scores[s] > 15]
                    fusion_confidence = float((sum_weights / sum(self.default_priorities[s] for s in ["Camera", "LiDAR", "Radar"])) * (np.mean(active_healths) if active_healths else 0.0))
                else:
                    fused_distance = -1.0
                    fusion_confidence = 0.0
            else:
                fused_distance = -1.0
                fusion_confidence = 0.0
                
        # Clamp fusion confidence between 0 and 1
        fusion_confidence = max(0.0, min(1.0, fusion_confidence))
        
        return {
            "fused_distance": round(fused_distance, 3) if fused_distance > 0 else -1.0,
            "fusion_confidence": round(fusion_confidence, 4),
            "mode": mode,
            "active_weights": {k: float(round(v, 2)) for k, v in self.active_weights.items()}
        }

    def update_active_weights(self, weights: Dict[str, float]):
        """
        Allows the Agentic AI layer to update the active fusion weights.
        """
        for sensor, weight in weights.items():
            if sensor in self.active_weights:
                self.active_weights[sensor] = max(0.0, min(1.0, weight))
