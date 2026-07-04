import csv
import json
import io
import math
import random
import time
from typing import Dict, List, Any

# Predefined scenarios modeled after nuScenes, A2D2, and Oxford RobotCar datasets.
# These replicate the typical sensor output patterns under different operational design domains (ODDs).

SCENARIOS = {
    "nuScenes_Urban_Traffic": {
        "name": "nuScenes - Boston Seaport (Urban Traffic)",
        "description": "Dense urban navigation in Boston Seaport. Standard day conditions, high pedestrian density, multi-target tracking active.",
        "config": {
            "speed": 11.1,  # 40 km/h
            "target_speed": 11.1,
            "obstacle_x": 45.0,
            "camera_fail": None,
            "lidar_fail": None,
            "radar_fail": None,
            "gps_fail": None,
            "imu_fail": None,
            "noise_multiplier": 1.0
        },
        "annotations": [
            {"class": "Pedestrian", "x": 45.0, "y": 2.0, "velocity": 1.2},
            {"class": "Car", "x": 55.0, "y": -3.5, "velocity": 8.0},
            {"class": "Bicycle", "x": 30.0, "y": 4.5, "velocity": 4.5}
        ]
    },
    "A2D2_Highway_Cruise": {
        "name": "A2D2 - Autobahn Munich (Highway Cruise)",
        "description": "High-speed highway driving on the German Autobahn. Clear conditions, low clutter, high-density LiDAR scans, high speed localization.",
        "config": {
            "speed": 27.7,  # 100 km/h
            "target_speed": 27.7,
            "obstacle_x": 95.0,
            "camera_fail": None,
            "lidar_fail": None,
            "radar_fail": None,
            "gps_fail": None,
            "imu_fail": None,
            "noise_multiplier": 0.5
        },
        "annotations": [
            {"class": "Car", "x": 95.0, "y": 0.0, "velocity": 22.0},
            {"class": "Truck", "x": 140.0, "y": -3.5, "velocity": 20.0}
        ]
    },
    "Oxford_RobotCar_Rainy_Canyon": {
        "name": "Oxford RobotCar - Broad Street (Rainy Urban Canyon)",
        "description": "Typical Oxford city center driving in heavy rain. High GPS multipath error, camera lens blur, sparse LiDAR reflections due to water spray.",
        "config": {
            "speed": 8.3,  # 30 km/h
            "target_speed": 8.3,
            "obstacle_x": 35.0,
            "camera_fail": "Blur",
            "lidar_fail": "Sparse",
            "radar_fail": None,
            "gps_fail": "Drift",
            "imu_fail": None,
            "noise_multiplier": 2.2
        },
        "annotations": [
            {"class": "Car", "x": 35.0, "y": -0.5, "velocity": 0.0}
        ]
    }
}

class DatasetLoader:
    def __init__(self):
        self.scenarios = SCENARIOS

    def get_scenario_list(self) -> List[Dict[str, str]]:
        return [
            {"id": key, "name": val["name"], "description": val["description"]}
            for key, val in self.scenarios.items()
        ]

    def load_scenario(self, scenario_id: str) -> Dict[str, Any]:
        if scenario_id in self.scenarios:
            return self.scenarios[scenario_id]
        raise ValueError(f"Scenario '{scenario_id}' not found.")

    def parse_csv_upload(self, contents: str) -> List[Dict[str, Any]]:
        """
        Parses custom uploaded CSV file containing sensor streams.
        Expected headers: timestamp, camera_blur, camera_brightness, lidar_points, radar_snr, gps_hdop, imu_accel_x, etc.
        """
        data = []
        try:
            f = io.StringIO(contents)
            reader = csv.DictReader(f)
            for row in reader:
                parsed_row = {}
                for key, val in row.items():
                    try:
                        parsed_row[key] = float(val)
                    except ValueError:
                        parsed_row[key] = val  # keep as string if not float
                data.append(parsed_row)
        except Exception as e:
            raise ValueError(f"Failed to parse CSV: {str(e)}")
        return data

    def parse_json_upload(self, contents: str) -> List[Dict[str, Any]]:
        """
        Parses custom uploaded JSON list containing telemetry frames.
        """
        try:
            data = json.loads(contents)
            if not isinstance(data, list):
                raise ValueError("JSON data must be a list of telemetry frames.")
            return data
        except Exception as e:
            raise ValueError(f"Failed to parse JSON: {str(e)}")
            
    def map_to_sensor_reading(self, custom_frame: Dict[str, Any]) -> Dict[str, Any]:
        """
        Maps a custom uploaded frame to the internal sensor reading schema.
        """
        # Sensible defaults for missing values
        timestamp = custom_frame.get("timestamp", time.time())
        distance = custom_frame.get("distance_to_obstacle", 50.0)
        
        mapped = {
            "timestamp": timestamp,
            "elapsed_time": custom_frame.get("elapsed_time", 0.0),
            "vehicle_state": {
                "speed": custom_frame.get("speed", 13.89),
                "heading": custom_frame.get("heading", 0.0),
                "x": custom_frame.get("position_x", 0.0),
                "y": custom_frame.get("position_y", 0.0),
                "acceleration": custom_frame.get("acceleration", 0.0)
            },
            "ground_truth": {
                "distance_to_obstacle": distance,
                "obstacle_x": custom_frame.get("obstacle_x", distance),
                "obstacle_y": custom_frame.get("obstacle_y", 0.0)
            },
            "sensors": {
                "Camera": {
                    "status": custom_frame.get("camera_status", "Normal"),
                    "failure_mode": custom_frame.get("camera_failure", "None"),
                    "brightness": int(custom_frame.get("camera_brightness", 128)),
                    "contrast": int(custom_frame.get("camera_contrast", 64)),
                    "blur_metric": float(custom_frame.get("camera_blur_metric", 15.0)),
                    "frozen": bool(custom_frame.get("camera_frozen", False)),
                    "frame_hash": int(custom_frame.get("camera_frame_hash", random.randint(1000, 9999))),
                    "detections": {
                        "count": int(custom_frame.get("camera_detections", 1 if distance < 80.0 else 0)),
                        "obstacle": {
                            "bbox": [100, 200, 150, 300],
                            "confidence": float(custom_frame.get("camera_confidence", 0.9))
                        }
                    }
                },
                "LiDAR": {
                    "status": custom_frame.get("lidar_status", "Normal"),
                    "failure_mode": custom_frame.get("lidar_failure", "None"),
                    "point_count": int(custom_frame.get("lidar_point_count", 50000)),
                    "noise_level": float(custom_frame.get("lidar_noise_level", 0.02)),
                    "detected_distance": float(custom_frame.get("lidar_distance", distance)),
                    "point_cloud_summary": []
                },
                "Radar": {
                    "status": custom_frame.get("radar_status", "Normal"),
                    "failure_mode": custom_frame.get("radar_failure", "None"),
                    "snr": float(custom_frame.get("radar_snr", 25.0)),
                    "num_targets": int(custom_frame.get("radar_targets", 1)),
                    "detected_distance": float(custom_frame.get("radar_distance", distance)),
                    "detected_velocity": float(custom_frame.get("radar_velocity", -10.0))
                },
                "GPS": {
                    "status": custom_frame.get("gps_status", "Normal"),
                    "failure_mode": custom_frame.get("gps_failure", "None"),
                    "latitude": float(custom_frame.get("gps_latitude", 37.7749)),
                    "longitude": float(custom_frame.get("gps_longitude", -122.4194)),
                    "hdop": float(custom_frame.get("gps_hdop", 0.8)),
                    "satellites": int(custom_frame.get("gps_satellites", 12))
                },
                "IMU": {
                    "status": custom_frame.get("imu_status", "Normal"),
                    "failure_mode": custom_frame.get("imu_failure", "None"),
                    "accel_x": float(custom_frame.get("imu_accel_x", 0.0)),
                    "accel_y": float(custom_frame.get("imu_accel_y", 0.0)),
                    "accel_z": float(custom_frame.get("imu_accel_z", -9.81)),
                    "yaw_rate": float(custom_frame.get("imu_yaw_rate", 0.0))
                }
            }
        }
        return mapped
