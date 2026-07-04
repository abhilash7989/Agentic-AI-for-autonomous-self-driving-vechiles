from app.ai.planner import create_plan
from app.ai.plan_executor import execute_plan

while True:
    user_input = input("You: ")

    if user_input.lower() == "exit":
        break

    plan = create_plan(user_input)

    print("\nGenerated Plan:\n")
    print(plan)

    results = execute_plan(plan)

    print("\nExecution Results:\n")
    print(results)
    print()