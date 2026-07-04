import os

from app.ai.embeddings import split_document, create_embeddings
from app.ai.vector_store import VectorStore

store = VectorStore()

all_chunks = []

# ---------- Load knowledge folder ----------
knowledge_folder = "knowledge"

if os.path.exists(knowledge_folder):
    for file in os.listdir(knowledge_folder):
        if file.endswith(".txt"):
            path = os.path.join(knowledge_folder, file)

            print("Knowledge:", path)

            with open(path, "r", encoding="utf-8") as f:
                text = f.read()

            chunks = split_document(text)
            all_chunks.extend(chunks)

# ---------- Load Python source code ----------
for root, dirs, files in os.walk("app"):

    dirs[:] = [d for d in dirs if d != "__pycache__"]

    for file in files:
        if file.endswith(".py"):

            path = os.path.join(root, file)

            print("Code:", path)

            with open(path, "r", encoding="utf-8") as f:
                code = f.read()

            document = f"""
FILE: {path}

{code}
"""

            chunks = split_document(document)
            all_chunks.extend(chunks)

print(f"\nTotal chunks: {len(all_chunks)}")

embeddings = create_embeddings(all_chunks)

store.add_documents(all_chunks, embeddings)

store.save()

print("\n✅ Complete knowledge base built successfully.")