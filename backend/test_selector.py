from app.ai.tool_selector import choose_tool

while True:
    user_input = input("You: ")

    if user_input.lower() == "exit":
        break

    result = choose_tool(user_input)

    print("\nGemini Decision:\n")
    print(result)
    print()