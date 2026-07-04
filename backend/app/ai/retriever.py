from app.ai.embeddings import embedding_model
from app.ai.vector_store import VectorStore


class Retriever:

    def __init__(self):
        self.store = VectorStore()
        self.store.load()

    def retrieve(self, question, k=3):

        query_embedding = embedding_model.encode(question).tolist()

        documents = self.store.search(
            query_embedding,
            k=k
        )

        return documents