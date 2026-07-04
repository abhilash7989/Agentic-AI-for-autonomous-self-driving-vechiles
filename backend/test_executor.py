from app.ai.tool_selector import choose_tool
from app.ai.tool_executor import execute_tool

while True:

    query = input("\nYou: ")

    if query.lower() == "exit":
        break

    decision = choose_tool(query)

    print("\nGemini Decision:\n")
    print(decision)

    result = execute_tool(decision)

    print("\nExecution Result:\n")
    print(result)