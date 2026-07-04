from app.ai.tool_selector import choose_tool

while True:

    query = input("\nYou: ")

    if query.lower() == "exit":
        break

    print("\nGemini Decision:\n")

    print(choose_tool(query))