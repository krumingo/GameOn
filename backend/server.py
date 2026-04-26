"""FootBallChat backend - FastAPI app entry point."""
from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, GEOSPHERE
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Local imports (after env load)
from deps import set_db, CURRENCY  # noqa: E402
from routes.auth import router as auth_router, me_router  # noqa: E402
from routes.groups import router as groups_router  # noqa: E402
from routes.memberships import router as memberships_router  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def _create_indexes(db) -> None:
    # users
    await db.users.create_index([("phone", ASCENDING)], unique=True, sparse=True)
    try:
        await db.users.create_index([("location.point", GEOSPHERE)])
    except Exception as exc:
        logger.warning("users.location.point 2dsphere index skipped: %s", exc)
    # groups
    await db.groups.create_index([("entry_code", ASCENDING)], unique=True, sparse=True)
    try:
        await db.groups.create_index([("location.point", GEOSPHERE)])
    except Exception as exc:
        logger.warning("groups.location.point 2dsphere index skipped: %s", exc)
    # memberships
    await db.memberships.create_index(
        [("group_id", ASCENDING), ("user_id", ASCENDING)], unique=True
    )
    await db.memberships.create_index([("user_id", ASCENDING)])
    # guests
    await db.guests.create_index([("phone", ASCENDING)], sparse=True)
    await db.guests.create_index([("group_id", ASCENDING)])
    # otp_codes (TTL on expires_at)
    await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    await db.otp_codes.create_index([("phone", ASCENDING)])


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    set_db(db)

    await _create_indexes(db)

    sms_mode = (
        "PRODUCTION (Twilio)"
        if (
            os.environ.get("TWILIO_ACCOUNT_SID")
            and os.environ.get("TWILIO_AUTH_TOKEN")
            and os.environ.get("TWILIO_PHONE_NUMBER")
        )
        else "DEV/TEST (fallback 123456)"
    )
    logger.info("SMS mode: %s", sms_mode)
    logger.info("Currency: %s", CURRENCY)
    logger.info("FootBallChat backend ready (db=%s)", db_name)

    try:
        yield
    finally:
        client.close()
        logger.info("MongoDB connection closed")


app = FastAPI(title="FootBallChat API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health
health_router = APIRouter(prefix="/api", tags=["health"])


@health_router.get("/health")
async def health():
    return {"status": "ok", "currency": CURRENCY}


@health_router.get("/")
async def root():
    return {"service": "FootBallChat", "status": "ok"}


# Register routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(groups_router)
app.include_router(memberships_router)
