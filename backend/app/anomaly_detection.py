import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.ensemble import IsolationForest
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Any, Optional

# --- PyTorch Autoencoder Definition ---
class SensorAutoencoder(nn.Module):
    def __init__(self, input_dim: int = 10):
        super(SensorAutoencoder, self).__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 6),
            nn.ReLU(),
            nn.Linear(6, 3),
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Linear(3, 6),
            nn.ReLU(),
            nn.Linear(6, input_dim)
        )

    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded


# Maps statistical fault labels → normalized classification enums
FAILURE_CLASS_MAP = {
    "Camera": {
        "None": "normal",
        "Blackout": "blackout",
        "Blur": "blur",
        "Freeze": "freeze",
    },
    "LiDAR": {
        "None": "normal",
        "Blackout": "blackout",
        "Sparse": "sparse",
        "Noise": "noise",
    },
    "Radar": {
        "None": "normal",
        "Signal Loss": "signal_loss",
        "Corruption": "corruption",
    },
    "GPS": {
        "None": "normal",
        "Loss": "loss",
        "Drift": "drift",
    },
    "IMU": {
        "None": "normal",
        "Drift": "drift",
    },
}


class AnomalyDetector:
    def __init__(self, use_sklearn_ae: bool = False):
        self.feature_names = [
            "cam_brightness", "cam_contrast", "cam_blur",
            "lidar_points", "lidar_noise",
            "radar_snr",
            "gps_hdop", "gps_satellites",
            "imu_accel_x", "imu_accel_y"
        ]
        self.scaler = StandardScaler()
        self.is_trained = False
        self.use_sklearn_ae = use_sklearn_ae

        self.isolation_forest = IsolationForest(contamination=0.05, random_state=42)
        self.autoencoder = SensorAutoencoder(input_dim=10)
        self.sklearn_ae: Optional[MLPRegressor] = None
        self.autoencoder_threshold = 0.05
        self.sklearn_ae_threshold = 0.05

        self.stat_thresholds = {
            "cam_brightness_low": 10,
            "cam_brightness_high": 245,
            "cam_contrast_low": 15,
            "cam_blur_low": 5.0,
            "lidar_points_sparse": 10000,
            "lidar_points_blackout": 50,
            "radar_snr_low": 5.0,
            "gps_hdop_high": 3.0,
            "gps_satellites_low": 4,
            "imu_drift_limit": 0.5
        }

        self.history = {"Camera": [], "GPS": [], "IMU": []}
        self._last_fault_labels: Dict[str, str] = {
            "Camera": "None", "LiDAR": "None", "Radar": "None", "GPS": "None", "IMU": "None"
        }

    def train_baseline(self, healthy_data: List[Dict[str, Any]]):
        if len(healthy_data) < 50:
            print("Not enough data to train anomaly models. Need at least 50 samples.")
            return False

        flat_vectors = [self._extract_features(sample) for sample in healthy_data]
        X = np.array(flat_vectors)

        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)

        self.isolation_forest.fit(X_scaled)

        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        criterion = nn.MSELoss()
        optimizer = optim.Adam(self.autoencoder.parameters(), lr=0.01)

        self.autoencoder.train()
        for _ in range(100):
            optimizer.zero_grad()
            outputs = self.autoencoder(X_tensor)
            loss = criterion(outputs, X_tensor)
            loss.backward()
            optimizer.step()

        self.autoencoder.eval()
        with torch.no_grad():
            reconstructed = self.autoencoder(X_tensor)
            mse_errors = torch.mean((reconstructed - X_tensor) ** 2, dim=1).numpy()
            self.autoencoder_threshold = float(np.percentile(mse_errors, 97.5))

        if self.use_sklearn_ae:
            self.sklearn_ae = MLPRegressor(
                hidden_layer_sizes=(6, 3, 6), max_iter=300, random_state=42
            )
            self.sklearn_ae.fit(X_scaled, X_scaled)
            sklearn_mse = np.mean((self.sklearn_ae.predict(X_scaled) - X_scaled) ** 2, axis=1)
            self.sklearn_ae_threshold = float(np.percentile(sklearn_mse, 97.5))

        self.is_trained = True
        print(f"Models successfully trained. Autoencoder threshold set to {self.autoencoder_threshold:.5f}")
        return True

    def _extract_features(self, sample: Dict[str, Any]) -> List[float]:
        sensors = sample["sensors"]
        return [
            float(sensors["Camera"]["brightness"]),
            float(sensors["Camera"]["contrast"]),
            float(sensors["Camera"]["blur_metric"]),
            float(sensors["LiDAR"]["point_count"]),
            float(sensors["LiDAR"]["noise_level"]),
            float(sensors["Radar"]["snr"]),
            float(sensors["GPS"]["hdop"]),
            float(sensors["GPS"]["satellites"]),
            float(sensors["IMU"]["accel_x"]),
            float(sensors["IMU"]["accel_y"])
        ]

    def classify_failures(self, fault_labels: Dict[str, str]) -> Dict[str, str]:
        """Return per-sensor normalized failure classification."""
        result = {}
        for sensor in ["Camera", "LiDAR", "Radar", "GPS", "IMU"]:
            label = fault_labels.get(sensor, "None")
            mapping = FAILURE_CLASS_MAP.get(sensor, {})
            result[sensor] = mapping.get(label, "unknown" if label != "None" else "normal")
        return result

    def compute_health_score(
        self,
        sensor: str,
        stat_confidence: float,
        ml_anomaly: bool,
        if_score: float = 0.0,
        ae_mse: float = 0.0,
        ae_threshold: float = 1.0,
    ) -> float:
        """Blend statistical confidence with ML anomaly signals → 0–100 health."""
        base = stat_confidence * 100.0

        if ml_anomaly and self.is_trained:
            if_penalty = min(30.0, if_score * 10.0)
            ae_ratio = ae_mse / ae_threshold if ae_threshold > 0 else 0.0
            ae_penalty = min(25.0, ae_ratio * 15.0)
            base = max(0.0, base - if_penalty * 0.4 - ae_penalty * 0.3)

        return float(round(max(0.0, min(100.0, base)), 1))

    def analyze_frame(self, current_frame: Dict[str, Any]) -> Dict[str, Any]:
        sensors = current_frame["sensors"]
        vehicle = current_frame["vehicle_state"]

        self.history["Camera"].append(sensors["Camera"])
        self.history["GPS"].append(sensors["GPS"])
        self.history["IMU"].append(sensors["IMU"])
        for key in self.history:
            if len(self.history[key]) > 20:
                self.history[key].pop(0)

        anomalies = {}
        confidence_scores = {s: 1.0 for s in ["Camera", "LiDAR", "Radar", "GPS", "IMU"]}
        fault_labels = {s: "None" for s in confidence_scores}

        # --- CAMERA ---
        cam = sensors["Camera"]
        if cam["brightness"] < self.stat_thresholds["cam_brightness_low"]:
            fault_labels["Camera"] = "Blackout"
            confidence_scores["Camera"] = 0.0
        elif cam["blur_metric"] < self.stat_thresholds["cam_blur_low"]:
            fault_labels["Camera"] = "Blur"
            confidence_scores["Camera"] = max(0.1, cam["blur_metric"] / 10.0)
        elif len(self.history["Camera"]) >= 5:
            hashes = [c["frame_hash"] for c in self.history["Camera"][-5:]]
            if len(set(hashes)) == 1:
                fault_labels["Camera"] = "Freeze"
                confidence_scores["Camera"] = 0.0

        if fault_labels["Camera"] != "None":
            anomalies["Camera"] = {
                "type": fault_labels["Camera"],
                "score": 1.0 - confidence_scores["Camera"],
                "source": "Statistical"
            }

        # --- LIDAR ---
        lidar = sensors["LiDAR"]
        if lidar["point_count"] < self.stat_thresholds["lidar_points_blackout"]:
            fault_labels["LiDAR"] = "Blackout"
            confidence_scores["LiDAR"] = 0.0
        elif lidar["point_count"] < self.stat_thresholds["lidar_points_sparse"]:
            fault_labels["LiDAR"] = "Sparse"
            confidence_scores["LiDAR"] = 0.3
        elif lidar["noise_level"] > 0.5:
            fault_labels["LiDAR"] = "Noise"
            confidence_scores["LiDAR"] = 0.4

        if fault_labels["LiDAR"] != "None":
            anomalies["LiDAR"] = {
                "type": fault_labels["LiDAR"],
                "score": 1.0 - confidence_scores["LiDAR"],
                "source": "Statistical"
            }

        # --- RADAR ---
        radar = sensors["Radar"]
        if radar["snr"] == 0:
            fault_labels["Radar"] = "Signal Loss"
            confidence_scores["Radar"] = 0.0
        elif radar["snr"] < self.stat_thresholds["radar_snr_low"] and radar["num_targets"] > 2:
            fault_labels["Radar"] = "Corruption"
            confidence_scores["Radar"] = 0.2

        if fault_labels["Radar"] != "None":
            anomalies["Radar"] = {
                "type": fault_labels["Radar"],
                "score": 1.0 - confidence_scores["Radar"],
                "source": "Statistical"
            }

        # --- GPS ---
        gps = sensors["GPS"]
        if gps["hdop"] > 90.0 or gps["satellites"] == 0:
            fault_labels["GPS"] = "Loss"
            confidence_scores["GPS"] = 0.0
        elif gps["hdop"] > self.stat_thresholds["gps_hdop_high"] or gps["satellites"] < self.stat_thresholds["gps_satellites_low"]:
            fault_labels["GPS"] = "Drift"
            confidence_scores["GPS"] = max(0.1, 4.0 / gps["hdop"] if gps["hdop"] > 0 else 0.0)

        if fault_labels["GPS"] != "None":
            anomalies["GPS"] = {
                "type": fault_labels["GPS"],
                "score": 1.0 - confidence_scores["GPS"],
                "source": "Statistical"
            }

        # --- IMU ---
        imu = sensors["IMU"]
        if len(self.history["IMU"]) >= 10 and abs(vehicle["speed"]) < 0.1:
            mean_accel_x = np.mean([i["accel_x"] for i in self.history["IMU"][-10:]])
            if abs(mean_accel_x) > self.stat_thresholds["imu_drift_limit"]:
                fault_labels["IMU"] = "Drift"
                confidence_scores["IMU"] = 0.3

        if fault_labels["IMU"] != "None":
            anomalies["IMU"] = {
                "type": fault_labels["IMU"],
                "score": 1.0 - confidence_scores["IMU"],
                "source": "Statistical"
            }

        self._last_fault_labels = fault_labels

        # --- ML inference ---
        ml_anomaly_detected = False
        if_score = 0.0
        ae_score = 0.0
        sklearn_ae_score = 0.0

        if self.is_trained:
            flat_vector = self._extract_features(current_frame)
            scaled_vector = self.scaler.transform([flat_vector])

            if_pred = self.isolation_forest.predict(scaled_vector)[0]
            if_score = float(-self.isolation_forest.decision_function(scaled_vector)[0])

            self.autoencoder.eval()
            with torch.no_grad():
                tensor_in = torch.tensor(scaled_vector, dtype=torch.float32)
                tensor_out = self.autoencoder(tensor_in)
                ae_score = float(torch.mean((tensor_out - tensor_in) ** 2).item())

            if self.use_sklearn_ae and self.sklearn_ae is not None:
                sklearn_recon = self.sklearn_ae.predict(scaled_vector)
                sklearn_ae_score = float(np.mean((sklearn_recon - scaled_vector) ** 2))

            if ae_score > self.autoencoder_threshold or if_pred == -1:
                ml_anomaly_detected = True
            if self.use_sklearn_ae and sklearn_ae_score > self.sklearn_ae_threshold:
                ml_anomaly_detected = True

        failure_classification = self.classify_failures(fault_labels)

        sensor_health = {}
        for sensor in confidence_scores:
            sensor_health[sensor] = self.compute_health_score(
                sensor,
                confidence_scores[sensor],
                ml_anomaly_detected,
                if_score,
                ae_score,
                self.autoencoder_threshold,
            )

        return {
            "is_anomalous": len(anomalies) > 0 or ml_anomaly_detected,
            "statistical_anomalies": anomalies,
            "ml_anomalies": {
                "detected": ml_anomaly_detected,
                "isolation_forest_score": if_score,
                "autoencoder_mse": ae_score,
                "autoencoder_threshold": self.autoencoder_threshold,
                "sklearn_ae_mse": sklearn_ae_score,
                "sklearn_ae_threshold": self.sklearn_ae_threshold,
            },
            "sensor_confidence": confidence_scores,
            "sensor_health": sensor_health,
            "failure_classification": failure_classification,
            "fault_labels": fault_labels,
        }
