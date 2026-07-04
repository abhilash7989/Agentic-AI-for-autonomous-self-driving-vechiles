from app.ai.rag import ask_rag
from app.ai.planner import create_plan
from app.ai.plan_executor import execute_plan
from app.ai.rule_planner import create_rule_plan
import json

def run_agent(user_input: str):

    # Try rule planner first
    rule_plan = create_rule_plan(user_input)

    if rule_plan:
        return execute_plan(json.dumps(rule_plan))

    # Otherwise ask Gemini
    plan = create_plan(user_input)

    cleaned = (
        plan.replace("```json", "")
            .replace("```", "")
            .strip()
    )

    if cleaned == "[]":
        return ask_rag(user_input)

    return execute_plan(plan)


