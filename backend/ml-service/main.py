"""
main.py  –  FastAPI microservice for fake currency detection
─────────────────────────────────────────────────────────────
Exposes:
  POST /predict   JSON body: { "image_b64": "<base64>", "mime_type": "image/jpeg" }
  GET  /health    liveness check

Start with:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import base64
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from currency_predictor import load_model, predict


# ── Lifespan: load model once on startup ────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Currency CNN Service",
    description="Fake / Real currency note classifier powered by currency_cnn.pt",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    image_b64: str   # base64-encoded image bytes
    mime_type: str   # e.g. "image/jpeg"

class PredictResponse(BaseModel):
    prediction: str   # "fake" | "real"
    confidence: float  # 0–100

class HealthResponse(BaseModel):
    status: str


ALLOWED_MIME = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp",
}


# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse, tags=["inference"])
async def predict_currency(req: PredictRequest):
    """
    Accepts a base64-encoded currency note image and returns
    'fake' or 'real' with a confidence score (0–100).
    """
    mime = req.mime_type.lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported mime_type '{mime}'. Allowed: {sorted(ALLOWED_MIME)}",
        )

    # Decode base64 → raw bytes
    try:
        raw = base64.b64decode(req.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 in image_b64.")

    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Decoded image is empty.")

    # Open with Pillow and fully decode pixel data
    try:
        image = Image.open(BytesIO(raw))
        image.load()            # fully decode all pixel data (catches corrupt files)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not decode image: {exc}",
        )

    # Run inference
    try:
        result = predict(image)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return PredictResponse(**result)
