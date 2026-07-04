import os

from app.ai.embeddings import split_document, create_embeddings
from app.ai.vector_store import VectorStore

store = VectorStore()

SOURCE_FOLDER = "app"

all_chunks = []

for root, dirs, files in os.walk(SOURCE_FOLDER):

    # Ignore cache folders
    dirs[:] = [d for d in dirs if d != "__pycache__"]

    for file in files:

        if file.endswith(".py"):

            path = os.path.join(root, file)

            print("Reading:", path)

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

print("\n✅ Entire codebase indexed successfully.")