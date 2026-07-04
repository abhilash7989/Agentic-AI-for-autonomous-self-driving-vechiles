import json

from app.ai.tools.registry.tool_registry import TOOLS


def execute_tool(tool_json: str):

    try:
        # Remove markdown code fences if present
        tool_json = tool_json.replace("```json", "")
        tool_json = tool_json.replace("```", "")
        tool_json = tool_json.strip()

        decision = json.loads(tool_json)

        tool_name = decision["tool"]
        arguments = decision["arguments"]

    except Exception as e:
        print("JSON Error:", e)
        return None

    for tool in TOOLS:

        if tool["name"] == tool_name:

            function = tool["function"]

            return function(**arguments)

    return None