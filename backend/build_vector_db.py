import os

from app.ai.embeddings import split_document, create_embeddings
from app.ai.vector_store import VectorStore

store = VectorStore()

knowledge_folder = "knowledge"

all_chunks = []

for filename in os.listdir(knowledge_folder):
    if filename.endswith(".txt"):
        path = os.path.join(knowledge_folder, filename)

        with open(path, "r", encoding="utf-8") as f:
            text = f.read()

        chunks = split_document(text)
        all_chunks.extend(chunks)

print(f"Loaded {len(all_chunks)} chunks")

embeddings = create_embeddings(all_chunks)

store.add_documents(all_chunks, embeddings)

store.save()

print("Vector database built successfully.")