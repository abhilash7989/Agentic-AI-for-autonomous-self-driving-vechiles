from app.ai.retriever import Retriever

retriever = Retriever()

docs = retriever.retrieve("What is LiDAR?", k=5)

print("\nRetrieved Documents:\n")

for i, doc in enumerate(docs, 1):
    print(f"\n========== Document {i} ==========\n")
    print(doc)