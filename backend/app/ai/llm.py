import os
from dotenv import load_dotenv

print("Step 1")
load_dotenv()

print("Step 2")
key = os.getenv("GOOGLE_API_KEY")

print("Step 3")

from langchain_google_genai import ChatGoogleGenerativeAI

print("Step 4")

print("Creating LLM...")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=key,
    temperature=0.2,
)

print("Step 5")