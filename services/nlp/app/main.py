from typing import List
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("nlp-service")

app = FastAPI(title="DearMe NLP Service", version="0.1.0")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class AnalyzeEntryRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=10000)


class AnalyzeEntryResponse(BaseModel):
    sentiment: str
    themes: List[str]
    confidence: float


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze-entry", response_model=AnalyzeEntryResponse)
def analyze_entry(payload: AnalyzeEntryRequest) -> AnalyzeEntryResponse:
    # Never log journal text. Log only metadata needed for ops.
    logger.info("analyze_entry called user_id=%s text_len=%s", payload.user_id, len(payload.text))
    return AnalyzeEntryResponse(
        sentiment="neutral",
        themes=["reflection", "balance"],
        confidence=0.62,
    )
