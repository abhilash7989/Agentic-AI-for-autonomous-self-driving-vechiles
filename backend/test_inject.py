from app.ai.tools.simulation_tools import inject_failure

result = inject_failure("Camera", "Blur")

print(result)