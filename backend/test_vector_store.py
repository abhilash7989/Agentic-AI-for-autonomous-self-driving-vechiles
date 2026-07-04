from app.ai.vector_store import add_documents, search_documents
import os

documents = []

knowledge_dir = "knowledge"

for filename in os.listdir(knowledge_dir):
    if filename.endswith(".txt"):
        with open(os.path.join(knowledge_dir, filename), "r", encoding="utf-8") as f:
            documents.append(f.read())

add_documents(documents)

results = search_documents("What is sensor fusion?")

print("\nRetrieved Documents:\n")

for doc in results:
    print(doc.page_content)
    print("-" * 50)