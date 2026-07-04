import json
import time

from app.ai.tool_executor import execute_tool


def execute_plan(plan_json: str):
    """
    Execute every tool call in sequence and return detailed results.
    """

    # Remove Markdown fences if Gemini returns them
    plan_json = (
        plan_json.replace("```json", "")
                 .replace("```", "")
                 .strip()
    )

    try:
        plan = json.loads(plan_json)
    except Exception as e:
        print("Plan JSON Error:", e)
        return []

    execution_results = []

    for index, step in enumerate(plan):

        tool_name = step.get("tool", "Unknown")

        start = time.time()

        try:
            result = execute_tool(json.dumps(step))

            duration = round((time.time() - start) * 1000, 2)

            execution_results.append(
                {
                    "step": index + 1,
                    "tool": tool_name,
                    "status": "success",
                    "execution_time_ms": duration,
                    "result": result
                }
            )

        except Exception as e:

            duration = round((time.time() - start) * 1000, 2)

            execution_results.append(
                {
                    "step": index + 1,
                    "tool": tool_name,
                    "status": "failed",
                    "execution_time_ms": duration,
                    "error": str(e)
                }
            )

    return execution_results