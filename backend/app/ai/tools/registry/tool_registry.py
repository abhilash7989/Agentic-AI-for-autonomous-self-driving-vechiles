from app.ai.tools.simulation_tools import (
    recover_sensor,
    inject_failure,
    change_speed,
)

TOOLS = [
    {
        "name": "recover_sensor",
        "description": (
            "Recover a failed autonomous vehicle sensor."
        ),
        "function": recover_sensor,
        "parameters": {
            "sensor": [
                "Camera",
                "LiDAR",
                "Radar",
                "GPS",
                "IMU"
            ]
        }
    },

    {
        "name": "inject_failure",
        "description": (
            "Inject a failure into a sensor for simulation."
        ),
        "function": inject_failure,
        "parameters": {
            "sensor": [
                "Camera",
                "LiDAR",
                "Radar",
                "GPS",
                "IMU"
            ],
            "failure_type": {
                "Camera": [
                    "Blur",
                    "Freeze",
                    "Blackout"
                ],
                "LiDAR": [
                    "Noise",
                    "Sparse",
                    "Blackout"
                ],
                "Radar": [
                    "Corruption",
                    "Signal Loss"
                ],
                "GPS": [
                    "Drift",
                    "Loss"
                ],
                "IMU": [
                    "Drift"
                ]
            }
        }
    }
    ,
{
    "name": "change_speed",
    "description": (
        "Change the target speed of the vehicle simulation."
    ),
    "function": change_speed,
    "parameters": {
        "speed": "float (meters per second)"
    }
}
]