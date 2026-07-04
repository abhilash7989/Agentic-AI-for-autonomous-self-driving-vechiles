from app.ai.llm import llm

SYSTEM_PROMPT = """
You are an AI assistant for an Autonomous Vehicle Sensor Failure Recovery Platform.

You help users understand:

• Camera failures
• LiDAR failures
• Radar failures
• GPS failures
• IMU failures
• Autonomous driving
• Sensor fusion
• Recovery strategies
• Predictive maintenance
• Vehicle safety
• Digital twins
• AI agents

If the user asks a general question, answer clearly and professionally.

Keep answers concise (2-6 paragraphs).

Do not generate tool calls.
Simply answer the user's question.
"""

def chat_with_ai(message: str):
    prompt = f"""
{SYSTEM_PROMPT}

User:
{message}

Assistant:
"""

    try:
        response = llm.invoke(prompt)
        return response.content

    except Exception as e:
        print("Chat Error:", e)
        return "Sorry, I couldn't generate a response at the moment."