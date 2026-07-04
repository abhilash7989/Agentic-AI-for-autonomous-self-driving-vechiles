import json

from app.ai.llm import llm
from app.ai.tools.registry.tool_registry import TOOLS


def choose_tool(user_input: str):

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
You are an autonomous AI agent.

Your job is to decide whether a tool should be used.

Available tools:

{tool_descriptions}

If a tool should be used,
reply ONLY with valid JSON.

Example:

{{
    "tool":"recover_sensor",
    "arguments": {{
        "sensor":"Camera"
    }}
}}

Example:

{{
    "tool":"inject_failure",
    "arguments": {{
        "sensor":"LiDAR",
        "failure_type":"Noise"
    }}
}}

Example:

{{
    "tool":"change_speed",
    "arguments": {{
        "speed":20
    }}
}}

If NO tool is needed reply

NONE

User Request:

{user_input}
"""

    response = llm.invoke(prompt)

    return response.content.strip()