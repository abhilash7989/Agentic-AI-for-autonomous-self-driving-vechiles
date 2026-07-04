import math
import random
from typing import Dict, Any

class PredictiveMaintenance:
    def __init__(self):
        # Weibull distribution parameters for sensor degradation modeling
        # Shape parameter beta (b) > 1 indicates wear-out failure over time.
        # Scale parameter lambda (L) indicates characteristic life in hours.
        self.weibull_params = {
            "Camera": {"beta": 2.2, "lambda": 1500.0, "base_hours": 350.0},
            "LiDAR": {"beta": 2.8, "lambda": 1200.0, "base_hours": 420.0},
            "Radar": {"beta": 2.0, "lambda": 2000.0, "base_hours": 150.0},
            "GPS": {"beta": 1.8, "lambda": 2500.0, "base_hours": 200.0},
            "IMU": {"beta": 3.0, "lambda": 3000.0, "base_hours": 80.0}
        }

        # Operational running counters
        self.operation_cycles = 0

    def compute_metrics(self, sensor_name: str, degradation_factor: float, failure_mode: str) -> Dict[str, Any]:
        """
        Calculates failure probability, RUL, and risk status for a given sensor based on wear and active failure status.
        - degradation_factor: 0.0 (new) to 1.0 (completely worn out)
        - failure_mode: active injected failure name or "None"
        """
        params = self.weibull_params[sensor_name]
        beta = params["beta"]
        scale = params["lambda"]
        
        # Base operational age of the sensor in hours
        base_age = params["base_hours"]
        
        # Calculate dynamic "equivalent operational age" based on degradation factor
        # A higher degradation accelerates the equivalent age towards the scale parameter
        equivalent_age = base_age + (degradation_factor * (scale - base_age) * 0.95)
        
        # Accelerate equivalent age if a failure is currently active (representing immediate severe stress/damage)
        if failure_mode != "None":
            equivalent_age = scale * 0.98  # near exhaustion
        
        # 1. Compute Weibull cumulative failure probability: F(t) = 1 - exp( - (t / L) ^ b )
        failure_prob = 1.0 - math.exp(-((equivalent_age / scale) ** beta))
        
        # Clamp failure probability
        if failure_mode != "None":
            failure_prob = max(0.99, failure_prob)
        else:
            failure_prob = min(0.95, failure_prob)
            
        # 2. Compute Remaining Useful Life (RUL) in simulated hours
        # Under normal conditions, RUL is (scale - equivalent_age) plus some random variance
        mttf = scale * math.gamma(1.0 + 1.0 / beta)  # Mean Time To Failure
        rul = max(0.0, mttf - equivalent_age)
        
        # Inject small signal noise to simulation
        if failure_mode == "None":
            rul += random.uniform(-2.0, 2.0)
            rul = max(1.0, rul)
        else:
            rul = 0.0 # Failed sensor has 0 remaining life
            
        # 3. Determine Risk Level and Early Warnings
        if failure_mode != "None" or failure_prob > 0.90 or rul < 24.0:
            risk_level = "Critical"
            warning = True
        elif failure_prob > 0.60 or rul < 100.0:
            risk_level = "High"
            warning = True
        elif failure_prob > 0.30 or rul < 300.0:
            risk_level = "Medium"
            warning = False
        else:
            risk_level = "Low"
            warning = False
            
        return {
            "sensor_name": sensor_name,
            "failure_probability": float(round(failure_prob, 4)),
            "estimated_rul": float(round(rul, 1)),
            "risk_level": risk_level,
            "early_warning_generated": warning
        }
        
    def step(self):
        self.operation_cycles += 1
