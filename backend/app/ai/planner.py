from app.ai.llm import llm
from app.ai.tools.registry.tool_registry import TOOLS


def create_plan(user_input: str):

    tool_descriptions = ""

    for tool in TOOLS:
        tool_descriptions += f"""
Tool:
{tool['name']}

Description:
{tool['description']}

Parameters:
{tool['parameters']}
"""

    prompt = f"""
You are an autonomous vehicle AI planner.

Your job is to analyze the user's request and generate a sequence of tool calls.

Available tools:

{tool_descriptions}

Rules:

1. Return ONLY valid JSON.
2. Always return a JSON array.
3. Each array element must contain:
   - tool
   - arguments
4. Preserve the logical order of execution.
5. If no tool is needed, return:
[]

Examples:

User:
Inject Camera Blur

Output:
[
    {{
        "tool":"inject_failure",
        "arguments": {{
            "sensor":"Camera",
            "failure_type":"Blur"
        }}
    }}
]

User:
Recover Camera

Output:
[
    {{
        "tool":"recover_sensor",
        "arguments": {{
            "sensor":"Camera"
        }}
    }}
]

User:
Reduce speed to 15 m/s

Output:
[
    {{
        "tool":"change_speed",
        "arguments": {{
            "speed":15
        }}
    }}
]

User:
Inject Camera Blur, reduce speed to 5 m/s, then recover the Camera.

Output:
[
    {{
        "tool":"inject_failure",
        "arguments": {{
            "sensor":"Camera",
            "failure_type":"Blur"
        }}
    }},
    {{
        "tool":"change_speed",
        "arguments": {{
            "speed":5
        }}
    }},
    {{
        "tool":"recover_sensor",
        "arguments": {{
            "sensor":"Camera"
        }}
    }}
]

User Request:

{user_input}
"""

    try:
        response = llm.invoke(prompt)
        return response.content.strip()

    except Exception as e:
        print("Planner Error:", e)
        return "[]"