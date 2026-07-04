from app.ai.retriever import Retriever
from app.ai.llm import llm

retriever = Retriever()

def ask_rag(question: str):

    docs = retriever.retrieve(question)

    context = "\n\n".join(docs)

    prompt = f"""
You are an expert Autonomous Vehicle AI Engineer.

Answer ONLY using the context below.

If the answer is not found in the context, reply:
"I don't have enough information."

Context:
{context}

Question:
{question}
"""

    response = llm.invoke(prompt)

    return response.content