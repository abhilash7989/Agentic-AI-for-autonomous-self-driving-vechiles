from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.ai_chat import router as ai_chat_router
from app.routes.sensor_input import router as sensor_input_router

app = FastAPI(
    title="Agentic AI Sensor Recovery Platform",
    version="1.0.0"
)

# -----------------------------
# CORS (IMPORTANT for React)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to frontend URL later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# ROUTES
# -----------------------------
app.include_router(ai_chat_router)
app.include_router(sensor_input_router)


@app.get("/")
def root():
    return {"message": "Backend is running 🚀"}