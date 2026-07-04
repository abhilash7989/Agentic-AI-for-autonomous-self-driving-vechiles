import faiss
import numpy as np
import pickle
import os


class VectorStore:
    def __init__(self, dimension=384):
        self.dimension = dimension
        self.index = faiss.IndexFlatL2(dimension)
        self.documents = []

    def add_documents(self, chunks, embeddings):
        vectors = np.array(embeddings).astype("float32")
        self.index.add(vectors)
        self.documents.extend(chunks)

    def search(self, query_embedding, k=3):
        query = np.array([query_embedding]).astype("float32")
        distances, indices = self.index.search(query, k)

        results = []
        for idx in indices[0]:
            if idx < len(self.documents):
                results.append(self.documents[idx])

        return results

    def save(self, folder="vector_db"):
        os.makedirs(folder, exist_ok=True)

        faiss.write_index(
            self.index,
            os.path.join(folder, "faiss.index")
        )

        with open(os.path.join(folder, "documents.pkl"), "wb") as f:
            pickle.dump(self.documents, f)

    def load(self, folder="vector_db"):
        self.index = faiss.read_index(
            os.path.join(folder, "faiss.index")
        )

        with open(os.path.join(folder, "documents.pkl"), "rb") as f:
            self.documents = pickle.load(f)