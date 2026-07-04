import time
import random
import math
import numpy as np

class VehicleSimulation:
    def __init__(self):
        self.reset()

    def reset(self):
        # Simulation Clock & Physics
        self.start_time = time.time()
        self.elapsed_time = 0.0
        self.dt = 0.1  # 10Hz update rate
        
        # Vehicle States
        self.position_x = 0.0
        self.position_y = 0.0
        self.heading = 0.0  # Radians
        self.speed = 13.89  # m/s (~50 km/h)
        self.target_speed = 13.89
        self.steering_angle = 0.0
        self.acceleration = 0.0
        
        # Obstacle State (obstacle on the path ahead)
        self.obstacle_x = 120.0
        self.obstacle_y = 0.0
        self.obstacle_speed = 0.0
        
        # Fault Injection States per Sensor
        # Values: Camera: None, Blur, Freeze, Blackout
        #         LiDAR: None, Noise, Sparse, Blackout
        #         Radar: None, Corruption, Signal Loss
        #         GPS: None, Drift, Loss
        #         IMU: None, Drift
        self.active_failures = {
            "Camera": None,
            "LiDAR": None,
            "Radar": None,
            "GPS": None,
            "IMU": None
        }

        # Wear-and-tear degradation factors (0 to 1, where 1 is complete wear)
        # These accumulate slowly and are used for predictive maintenance
        self.degradation = {
            "Camera": 0.05,
            "LiDAR": 0.08,
            "Radar": 0.02,
            "GPS": 0.03,
            "IMU": 0.01
        }
        
        # History caches for frozen frames, drift accumulation, etc.
        self.camera_last_frame_hash = random.randint(100000, 999999)
        self.camera_freeze_counter = 0
        self.gps_drift_x = 0.0
        self.gps_drift_y = 0.0
        self.imu_drift_x = 0.0
        self.imu_drift_y = 0.0
        
        # Last simulated readings cache (for freeze simulation)
        self.last_readings = {}

    def inject_failure(self, sensor: str, failure_type: str):
        if sensor in self.active_failures:
            self.active_failures[sensor] = failure_type if failure_type != "None" else None
            # When failures are injected, accelerate degradation for predictive maintenance simulation
            if failure_type != "None":
                self.degradation[sensor] = min(0.98, self.degradation[sensor] + 0.15)
            return True
        return False
    def change_speed(speed: float):

      response = requests.post(
         f"{BASE_URL}/api/simulation/speed",
         data={
            "speed": speed
        }
    )

      if response.status_code == 200:
        return response.json()

      return {
        "error": response.text
    }

    def recover_sensor(self, sensor: str):
        if sensor in self.active_failures:
            self.active_failures[sensor] = None
            # Reset wear/degradation to a healthy state representing repair
            self.degradation[sensor] = max(0.01, self.degradation[sensor] - 0.3)
            # Reset drift accumulates
            if sensor == "GPS":
                self.gps_drift_x = 0.0
                self.gps_drift_y = 0.0
            elif sensor == "IMU":
                self.imu_drift_x = 0.0
                self.imu_drift_y = 0.0
            return True
        return False

    def step(self):
        self.elapsed_time += self.dt
        
        # 1. Update Vehicle Physics (simple steering model)
        # Slow down if target speed changes (e.g. agent orders slowdown)
        speed_error = self.target_speed - self.speed
        self.acceleration = np.clip(speed_error * 1.5, -5.0, 3.0)  # Acceleration limits
        self.speed = max(0.0, self.speed + self.acceleration * self.dt)
        
        # Small sine-wave steering for vehicle trajectory to simulate curve navigation
        self.steering_angle = 0.05 * math.sin(self.elapsed_time * 0.2)
        self.heading += (self.speed * math.tan(self.steering_angle) / 2.5) * self.dt  # L=2.5m wheelbase
        self.heading = (self.heading + math.pi) % (2 * math.pi) - math.pi  # Normalize to [-pi, pi]
        
        # Update coordinates
        self.position_x += self.speed * math.cos(self.heading) * self.dt
        self.position_y += self.speed * math.sin(self.heading) * self.dt
        
        # 2. Update Obstacle Physics (obstacle moves slowly or is static)
        # Keep obstacle at a constant offset or reset if passed
        dist = self.obstacle_x - self.position_x
        if dist < 5.0:
            self.obstacle_x = self.position_x + 120.0  # Spawn new obstacle 120m ahead
            self.obstacle_y = self.position_y + random.uniform(-1.0, 1.0)
            
        obstacle_distance = math.sqrt((self.obstacle_x - self.position_x)**2 + (self.obstacle_y - self.position_y)**2)
        
        # 3. Simulate Sensor Degradation (slow wear-and-tear over time)
        for sensor in self.degradation:
            # Accumulate normal wear
            self.degradation[sensor] = min(0.99, self.degradation[sensor] + 0.0002)

        # 4. Generate Sensor Readings
        readings = {
            "timestamp": time.time(),
            "elapsed_time": self.elapsed_time,
            "vehicle_state": {
                "speed": self.speed,
                "heading": self.heading,
                "x": self.position_x,
                "y": self.position_y,
                "acceleration": self.acceleration
            },
            "ground_truth": {
                "distance_to_obstacle": obstacle_distance,
                "obstacle_x": self.obstacle_x,
                "obstacle_y": self.obstacle_y
            },
            "sensors": {}
        }
        
        readings["sensors"]["Camera"] = self._simulate_camera(obstacle_distance)
        readings["sensors"]["LiDAR"] = self._simulate_lidar(obstacle_distance)
        readings["sensors"]["Radar"] = self._simulate_radar(obstacle_distance)
        readings["sensors"]["GPS"] = self._simulate_gps()
        readings["sensors"]["IMU"] = self._simulate_imu()
        
        self.last_readings = readings["sensors"]
        return readings

    def _simulate_camera(self, distance):
        failure = self.active_failures["Camera"]
        
        # Default healthy values
        brightness = 128 + int(10 * math.sin(self.elapsed_time * 0.1))  # 0-255 scale
        contrast = 64 + random.randint(-2, 2)
        blur_metric = 15.0 + random.uniform(-0.5, 0.5)  # low is blurry, high is sharp (e.g. Laplacian variance)
        frozen = False
        frame_hash = random.randint(100000, 999999)
        detection_count = 1 if distance < 80.0 else 0
        obstacle_bbox = [int(100 + 50/distance), 200, int(150 + 100/distance), 300] if detection_count > 0 else []
        
        # Inject anomalies
        if failure == "Blur":
            blur_metric = 2.1 + random.uniform(-0.2, 0.2)  # High blur, low sharpness metric
            contrast = 20
        elif failure == "Freeze":
            frozen = True
            if "Camera" in self.last_readings:
                return self.last_readings["Camera"]  # Return exactly the last readings
        elif failure == "Blackout":
            brightness = 0
            contrast = 0
            blur_metric = 0.0
            detection_count = 0
            obstacle_bbox = []
        
        # Normal image feature generation
        return {
            "status": "Fault" if failure else "Normal",
            "failure_mode": failure or "None",
            "brightness": brightness,
            "contrast": contrast,
            "blur_metric": blur_metric,
            "frozen": frozen,
            "frame_hash": frame_hash,
            "detections": {
                "count": detection_count,
                "obstacle": {
                    "bbox": obstacle_bbox,
                    "confidence": 0.95 - (distance * 0.005) if (detection_count > 0 and failure != "Blur") else (0.3 if failure == "Blur" else 0.0)
                }
            }
        }

    def _simulate_lidar(self, distance):
        failure = self.active_failures["LiDAR"]
        
        # Default healthy values
        base_points = 50000
        noise_level = 0.02  # meters standard deviation
        point_cloud = self._generate_lidar_points(distance, sparse=False, noisy=False)
        detected_distance = distance + random.normalvariate(0, 0.02)
        
        if failure == "Noise":
            noise_level = 0.8  # Very noisy
            point_cloud = self._generate_lidar_points(distance, sparse=False, noisy=True)
            detected_distance = distance + random.normalvariate(0, 0.5)
        elif failure == "Sparse":
            base_points = 4500  # Sparse cloud
            point_cloud = self._generate_lidar_points(distance, sparse=True, noisy=False)
            detected_distance = distance + random.normalvariate(0, 0.1)
        elif failure == "Blackout":
            base_points = 0
            point_cloud = []
            detected_distance = -1.0  # Invalid
            
        return {
            "status": "Fault" if failure else "Normal",
            "failure_mode": failure or "None",
            "point_count": base_points,
            "noise_level": noise_level,
            "detected_distance": detected_distance,
            "point_cloud_summary": point_cloud  # Simplified list of (x,y) points for digital twin
        }

    def _generate_lidar_points(self, distance, sparse=False, noisy=False):
        # Generate 15 points to represent the obstacle and road surface for the frontend canvas
        points = []
        # Obstacle points
        num_points = 3 if sparse else 10
        std = 0.4 if noisy else 0.05
        
        for i in range(num_points):
            angle = random.uniform(-0.1, 0.1)
            dist_noise = random.normalvariate(0, std)
            pt_dist = distance + dist_noise
            # Convert to relative coordinates in vehicle frame
            px = pt_dist * math.cos(angle)
            py = pt_dist * math.sin(angle)
            points.append({"x": px, "y": py, "intensity": random.uniform(0.5, 1.0)})
            
        return points

    def _simulate_radar(self, distance):
        failure = self.active_failures["Radar"]
        
        # Healthy values
        snr = 25.0  # dB
        num_targets = 1 if distance < 100.0 else 0
        detected_distance = distance + random.normalvariate(0, 0.1)
        detected_velocity = -self.speed + random.normalvariate(0, 0.05)  # Approaching obstacle
        
        if failure == "Corruption":
            snr = 3.5  # Heavy clutter/noise
            num_targets = 4  # False ghost reflections
            detected_distance = distance + random.normalvariate(5.0, 4.0)  # Multi-path reflection error
            detected_velocity = random.uniform(-30.0, 30.0)
        elif failure == "Signal Loss":
            snr = 0.0
            num_targets = 0
            detected_distance = -1.0
            detected_velocity = 0.0
            
        return {
            "status": "Fault" if failure else "Normal",
            "failure_mode": failure or "None",
            "snr": snr,
            "num_targets": num_targets,
            "detected_distance": detected_distance,
            "detected_velocity": detected_velocity
        }

    def _simulate_gps(self):
        failure = self.active_failures["GPS"]
        
        # base values
        lat_base = 37.7749
        lon_base = -122.4194
        
        # Convert vehicle position coordinates (m) to latitude/longitude offset
        lat_deg = lat_base + (self.position_y / 111111.0)
        lon_deg = lon_base + (self.position_x / (111111.0 * math.cos(math.radians(lat_base))))
        
        hdop = 0.8  # Horizontal Dilution of Precision (lower is better)
        satellite_count = 14
        
        # Apply failure
        if failure == "Drift":
            # Slowly accumulate coordinates drift
            self.gps_drift_x += random.uniform(-0.15, 0.25)
            self.gps_drift_y += random.uniform(-0.15, 0.25)
            hdop = 3.2
            satellite_count = 6
        elif failure == "Loss":
            hdop = 99.0
            satellite_count = 0
            return {
                "status": "Fault",
                "failure_mode": "Loss",
                "latitude": 0.0,
                "longitude": 0.0,
                "hdop": hdop,
                "satellites": satellite_count
            }
            
        return {
            "status": "Fault" if failure else "Normal",
            "failure_mode": failure or "None",
            "latitude": lat_deg + (self.gps_drift_y / 111111.0),
            "longitude": lon_deg + (self.gps_drift_x / (111111.0 * math.cos(math.radians(lat_base)))),
            "hdop": hdop,
            "satellites": satellite_count
        }

    def _simulate_imu(self):
        failure = self.active_failures["IMU"]
        
        # base vehicle motion accelerations
        ax = self.acceleration + random.normalvariate(0, 0.05)
        ay = self.speed**2 * math.tan(self.steering_angle) / 2.5 + random.normalvariate(0, 0.05)  # Centrifugal acceleration
        az = -9.81 + random.normalvariate(0, 0.02)  # Gravity
        
        # Gyro angular rate
        yaw_rate = (self.speed * math.tan(self.steering_angle) / 2.5) + random.normalvariate(0, 0.01)
        
        if failure == "Drift":
            self.imu_drift_x += 0.02  # Systematic bias accumulation
            self.imu_drift_y += 0.01
            ax += self.imu_drift_x
            ay += self.imu_drift_y
            
        return {
            "status": "Fault" if failure else "Normal",
            "failure_mode": failure or "None",
            "accel_x": ax,
            "accel_y": ay,
            "accel_z": az,
            "yaw_rate": yaw_rate
        }
