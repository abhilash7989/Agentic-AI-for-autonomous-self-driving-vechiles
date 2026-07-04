from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Load embedding model once
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50
)


def split_document(text: str):
    """
    Split a large document into smaller chunks.
    """
    return splitter.split_text(text)


def create_embeddings(chunks):
    """
    Convert text chunks into vector embeddings.
    """
    vectors = embedding_model.encode(chunks).tolist()
    return vectors