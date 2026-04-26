"""Push notification service via Expo Push API."""
from __future__ import annotations

import logging
from typing import Optional

import httpx
from bson import ObjectId

from deps import get_db

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_batch(
    tokens: list[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    sound: str = "default",
    channel_id: str = "matches",
) -> int:
    """Send push notifications via Expo Push API. Returns count of sent."""
    messages = []
    for t in tokens:
        if not t or not t.startswith("ExponentPushToken"):
            continue
        messages.append({
            "to": t,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": sound,
            "channelId": channel_id,
        })
    if not messages:
        return 0
    sent = 0
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for i in range(0, len(messages), 100):
                batch = messages[i:i + 100]
                try:
                    await client.post(EXPO_PUSH_URL, json=batch)
                    sent += len(batch)
                except Exception as e:
                    logger.warning(f"Expo push batch error: {e}")
    except Exception as e:
        logger.warning(f"Expo push outer error: {e}")
    return sent


async def get_group_push_tokens(
    group_id: str,
    exclude_user_id: Optional[str] = None,
    pref_key: Optional[str] = None,
) -> list[str]:
    """Get push tokens for group members. Optionally filter by push_prefs key."""
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        return []
    user_ids = []
    async for m in db.memberships.find({"group_id": gid}):
        uid = m.get("user_id")
        if uid is None:
            continue
        if exclude_user_id and str(uid) == str(exclude_user_id):
            continue
        user_ids.append(uid)
    if not user_ids:
        return []
    out = []
    async for u in db.users.find({
        "_id": {"$in": user_ids},
        "expo_push_token": {"$ne": None},
    }):
        token = u.get("expo_push_token")
        if not token:
            continue
        if pref_key:
            prefs = u.get("push_prefs") or {}
            # Default to True if pref not set (except rsvp_changes which defaults to False)
            default = False if pref_key == "rsvp_changes" else True
            if not prefs.get(pref_key, default):
                continue
        out.append(token)
    return out


async def get_user_push_tokens_for_match(
    match: dict,
    exclude_user_id: Optional[str] = None,
    rsvp_status: str = "going",
    pref_key: Optional[str] = None,
) -> list[str]:
    """Get push tokens for users with given RSVP status on match (e.g. all 'going' players for cancel notifications)."""
    db = get_db()
    user_ids = set()
    for r in (match.get("rsvps") or []):
        if r.get("status") == rsvp_status and r.get("user_id"):
            uid = r["user_id"]
            if exclude_user_id and str(uid) == str(exclude_user_id):
                continue
            user_ids.add(uid)
    if not user_ids:
        return []
    out = []
    async for u in db.users.find({
        "_id": {"$in": list(user_ids)},
        "expo_push_token": {"$ne": None},
    }):
        token = u.get("expo_push_token")
        if not token:
            continue
        if pref_key:
            prefs = u.get("push_prefs") or {}
            default = False if pref_key == "rsvp_changes" else True
            if not prefs.get(pref_key, default):
                continue
        out.append(token)
    return out
