from app.ai.planner import create_plan

while True:
    user_input = input("You: ")

    if user_input.lower() == "exit":
        break

    plan = create_plan(user_input)

    print("\nGenerated Plan:\n")
    print(plan)
    print()