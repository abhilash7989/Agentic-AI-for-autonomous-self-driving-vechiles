import re


def create_rule_plan(user_input: str):
    text = user_input.lower()

    plan = []

    sensors = ["camera", "lidar", "radar", "gps", "imu"]

    # -------------------------
    # Recover Sensor
    # -------------------------
    for sensor in sensors:
        if f"recover {sensor}" in text:

            proper = "LiDAR" if sensor == "lidar" else sensor.upper() if sensor == "gps" else sensor.capitalize()

            plan.append({
                "tool": "recover_sensor",
                "arguments": {
                    "sensor": proper
                }
            })

    # -------------------------
    # Inject Failures
    # -------------------------
    failures = [
        "blur",
        "noise",
        "dropout",
        "failure",
        "bias"
    ]

    for sensor in sensors:
        for failure in failures:

            if sensor in text and failure in text:

                proper = "LiDAR" if sensor == "lidar" else sensor.upper() if sensor == "gps" else sensor.capitalize()

                plan.append({
                    "tool": "inject_failure",
                    "arguments": {
                        "sensor": proper,
                        "failure_type": failure.capitalize()
                    }
                })

    # -------------------------
    # Speed
    # -------------------------

    match = re.search(r'(\d+)', text)

    if match:

        speed = int(match.group())

        if "speed" in text:

            plan.append({
                "tool": "change_speed",
                "arguments": {
                    "speed": speed
                }
            })

    return plan