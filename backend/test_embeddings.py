from app.ai.embeddings import split_document, create_embeddings

with open("sample.txt", "r", encoding="utf-8") as f:
    text = f.read()

chunks = split_document(text)

vectors = create_embeddings(chunks)

print("Chunks:")
for i, chunk in enumerate(chunks, 1):
    print(f"{i}. {chunk}")

print("\nNumber of Chunks:", len(chunks))
print("Embedding Dimension:", len(vectors[0]))