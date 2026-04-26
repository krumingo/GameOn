"""Push notifications endpoints: register-token, prefs CRUD, dev test."""
from __future__ import annotations

import os
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import get_current_user_impl, get_db
from services.push_service import send_push_batch

router = APIRouter(prefix="/api/push", tags=["push"])

DEFAULT_PREFS = {
    "new_matches": True,
    "reminders": True,
    "reminder_hours": 24,
    "rsvp_changes": False,
    "chat": True,
}


class RegisterTokenRequest(BaseModel):
    token: str


class UpdatePrefsRequest(BaseModel):
    new_matches: Optional[bool] = None
    reminders: Optional[bool] = None
    reminder_hours: Optional[int] = Field(default=None, ge=1, le=168)
    rsvp_changes: Optional[bool] = None
    chat: Optional[bool] = None


@router.post("/register-token")
async def register_token(payload: RegisterTokenRequest, current=Depends(get_current_user_impl)):
    if not payload.token or not payload.token.startswith("ExponentPushToken"):
        raise HTTPException(status_code=400, detail="Невалиден push token")
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"expo_push_token": payload.token}},
    )
    return {"success": True}


@router.delete("/register-token")
async def unregister_token(current=Depends(get_current_user_impl)):
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"expo_push_token": None}},
    )
    return {"success": True}


@router.get("/prefs")
async def get_prefs(current=Depends(get_current_user_impl)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(current["id"])}, {"_id": 0, "push_prefs": 1})
    prefs = (user or {}).get("push_prefs") or {}
    return {**DEFAULT_PREFS, **prefs}


@router.put("/prefs")
async def update_prefs(payload: UpdatePrefsRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(current["id"])}, {"_id": 0, "push_prefs": 1})
    prefs = {**DEFAULT_PREFS, **((user or {}).get("push_prefs") or {})}
    update = payload.model_dump(exclude_unset=True)
    prefs.update(update)
    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"push_prefs": prefs}},
    )
    return prefs


@router.post("/test")
async def test_push(current=Depends(get_current_user_impl)):
    """Dev-only test endpoint. Sends a test notification to current user's expo_push_token."""
    if os.environ.get("SUPER_TEST_LOGIN_ENABLED", "").lower() != "true":
        raise HTTPException(status_code=403, detail="Disabled in production")
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(current["id"])}, {"_id": 0, "expo_push_token": 1})
    token = (user or {}).get("expo_push_token")
    if not token:
        return {"sent": False, "reason": "Няма регистриран push token"}
    sent = await send_push_batch(
        [token],
        title="GameOn тест",
        body="Push нотификациите работят! ⚽",
        data={"type": "test"},
        channel_id="system",
    )
    return {"sent": sent > 0}
