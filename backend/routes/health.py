"""Health check route."""
from __future__ import annotations
import os
from fastapi import APIRouter

from deps import CURRENCY

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": os.environ.get("APP_VERSION", "1.0.0"),
        "currency": CURRENCY,
    }


@router.get("/")
async def root():
    return {"service": "FootBallChat", "status": "ok"}
