import requests

BASE_URL = "http://127.0.0.1:8000"


def recover_sensor(sensor: str):
    """
    Calls the FastAPI endpoint to recover a sensor.
    """

    response = requests.post(
        f"{BASE_URL}/api/simulation/recover-sensor",
        data={
            "sensor": sensor
        }
    )

    if response.status_code == 200:
        return response.json()

    return {
        "error": response.text
    }


def inject_failure(sensor: str, failure_type: str):
    """
    Calls the FastAPI endpoint to inject a failure into a sensor.
    """

    response = requests.post(
        f"{BASE_URL}/api/simulation/inject-failure",
        data={
            "sensor": sensor,
            "failure_type": failure_type
        }
    )

    if response.status_code == 200:
        return response.json()

    return {
        "error": response.text
    }
def change_speed(speed: float):
    """
    Calls the FastAPI endpoint to change the simulation speed.
    """

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