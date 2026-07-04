from app.ai.llm import ask_llm

question = "Explain the role of LiDAR in autonomous vehicles in 5 lines."

response = ask_llm(question)

print("\nQuestion:")
print(question)

print("\nAnswer:")
print(response)