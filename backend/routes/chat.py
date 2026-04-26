"""Chat — text + emoji (Unicode)."""
from __future__ import annotations

from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    ChatMessageRequest,
    get_current_user_impl,
    get_db,
    utc_now,
)

router = APIRouter(prefix="/api/groups", tags=["chat"])

MAX_TEXT = 2000


def _serialize(m: dict) -> dict:
    return {
        "id": str(m["_id"]),
        "group_id": str(m.get("group_id")),
        "match_id": str(m["match_id"]) if m.get("match_id") else None,
        "user_id": str(m.get("user_id")) if m.get("user_id") else None,
        "user_name": m.get("user_name"),
        "text": m.get("text"),
        "created_at": m["created_at"].isoformat() if hasattr(m.get("created_at"), "isoformat") else m.get("created_at"),
    }


async def _is_member(user_id: str, group_id: ObjectId) -> bool:
    db = get_db()
    try:
        uid = ObjectId(user_id)
    except Exception:
        return False
    m = await db.memberships.find_one({"group_id": group_id, "user_id": uid}, {"_id": 1})
    return m is not None


@router.get("/{group_id}/chat")
async def list_messages(
    group_id: str,
    before: Optional[str] = None,
    match_id: Optional[str] = None,
    limit: int = 50,
    current=Depends(get_current_user_impl),
):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    if not await _is_member(current["id"], gid):
        raise HTTPException(status_code=403, detail="Не си член на групата")

    q: dict = {"group_id": gid}
    if match_id:
        try:
            q["match_id"] = ObjectId(match_id)
        except Exception:
            pass
    if before:
        try:
            bid = ObjectId(before)
            q["_id"] = {"$lt": bid}
        except Exception:
            pass
    cursor = db.messages.find(q).sort("_id", -1).limit(limit + 1)
    items = [m async for m in cursor]
    has_more = len(items) > limit
    items = items[:limit]
    items.reverse()  # oldest first
    return {"messages": [_serialize(m) for m in items], "has_more": has_more}


@router.post("/{group_id}/chat")
async def post_message(group_id: str, payload: ChatMessageRequest,
                        current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    if not await _is_member(current["id"], gid):
        raise HTTPException(status_code=403, detail="Не си член на групата")
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Празно съобщение")
    if len(text) > MAX_TEXT:
        raise HTTPException(status_code=400, detail=f"Максимум {MAX_TEXT} символа")

    match_oid = None
    if payload.match_id:
        try:
            match_oid = ObjectId(payload.match_id)
        except Exception:
            pass

    doc = {
        "group_id": gid,
        "match_id": match_oid,
        "user_id": ObjectId(current["id"]),
        "user_name": current.get("name") or "",
        "text": text,
        "created_at": utc_now(),
    }
    res = await db.messages.insert_one(doc)
    saved = await db.messages.find_one({"_id": res.inserted_id})
    return _serialize(saved)
