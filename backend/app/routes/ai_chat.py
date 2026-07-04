from fastapi import APIRouter
from pydantic import BaseModel

from app.ai.chat import chat_with_ai
from app.ai.agent import run_agent

router = APIRouter(
    prefix="/api/ai",
    tags=["AI Assistant"]
)


class ChatRequest(BaseModel):
    question: str


@router.post("/chat")
def chat(request: ChatRequest):

    user_message = request.question

    # Try the autonomous agent first
    agent_result = run_agent(user_message)

    # If the planner didn't create any tool calls,
    # answer using Gemini instead.
    if len(agent_result) == 0:
        answer = chat_with_ai(user_message)

        return {
            "success": True,
            "mode": "chat",
            "answer": answer
        }

    return {
        "success": True,
        "mode": "agent",
        "response": agent_result
    }