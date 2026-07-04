from app.ai.rag import ask_rag

while True:

    question = input("\nAsk a question (type exit to quit): ")

    if question.lower() == "exit":
        break

    answer = ask_rag(question)

    print("\nAI Answer:\n")
    print(answer)