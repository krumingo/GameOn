"""Group management routes."""
from __future__ import annotations

import secrets
import string
import logging
from datetime import timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    CreateGroupRequest,
    JoinGroupRequest,
    UpdateGroupRequest,
    AddCategoryRequest,
    DEFAULT_POINTS_CONFIG,
    DEFAULT_CASH_CATEGORIES,
    CURRENCY,
    FREE_MAX_GROUPS,
    ROLE_OWNER,
    ROLE_MEMBER,
    get_current_user_impl,
    get_db,
    get_group_plan,
    pro_until,
    require_admin,
    serialize_doc,
    trial_days_left,
    utc_now,
)
from services.membership_service import (
    count_members,
    count_owner_groups,
    list_members_with_users,
    merge_guest_records,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/groups", tags=["groups"])


def _gen_entry_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _ensure_location_point(loc):
    """Adds a GeoJSON 'point' field to location dict when lat/lng exist (for 2dsphere index)."""
    if not isinstance(loc, dict):
        return loc
    lat = loc.get("lat")
    lng = loc.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        loc["point"] = {"type": "Point", "coordinates": [float(lng), float(lat)]}
    else:
        loc.pop("point", None)
    return loc


def _validate_points_config(cfg: dict) -> None:
    for key in ("win", "draw", "loss"):
        if key not in cfg:
            raise HTTPException(status_code=400, detail=f"points_config.{key} липсва")
        v = cfg[key]
        if not isinstance(v, (int, float)) or v < 0:
            raise HTTPException(status_code=400, detail=f"points_config.{key} трябва да е число >= 0")


async def _build_group_summary(group: dict, user_id: str, role: Optional[str] = None) -> dict:
    db = get_db()
    gid = group["_id"]
    if role is None:
        m = await db.memberships.find_one({"group_id": gid, "user_id": ObjectId(user_id)}, {"role": 1, "_id": 0})
        role = m["role"] if m else None

    members_cnt = await count_members(str(gid))
    now = utc_now()
    upcoming_q = {"group_id": gid, "start_datetime": {"$gte": now}}
    matches_count = await db.matches.count_documents(upcoming_q)
    matches_cursor = db.matches.find(upcoming_q).sort("start_datetime", 1).limit(5)

    matches_list = []
    async for m in matches_cursor:
        going_count = await db.rsvps.count_documents({"match_id": m["_id"], "status": "GOING"})
        player_limit = m.get("player_limit") or group.get("default_player_limit", 14)
        free_spots = max(0, player_limit - going_count)
        user_rsvp = await db.rsvps.find_one(
            {"match_id": m["_id"], "user_id": ObjectId(user_id)},
            {"status": 1, "_id": 0},
        )
        matches_list.append({
            "id": str(m["_id"]),
            "name": m.get("name"),
            "venue": m.get("venue"),
            "start_datetime": m["start_datetime"].isoformat() if hasattr(m.get("start_datetime"), "isoformat") else m.get("start_datetime"),
            "going_count": going_count,
            "free_spots": free_spots,
            "user_rsvp_status": user_rsvp.get("status") if user_rsvp else None,
            "price_per_player": m.get("price_per_player"),
        })

    plan = await get_group_plan(str(gid))
    days_left = await trial_days_left(str(gid))
    p_until = await pro_until(str(gid))

    return {
        "id": str(gid),
        "name": group.get("name"),
        "entry_code": group.get("entry_code"),
        "location": group.get("location"),
        "venue": group.get("venue"),
        "currency": group.get("currency", CURRENCY),
        "role": role,
        "members_count": members_cnt,
        "matches_count": matches_count,
        "matches_list": matches_list,
        "plan": plan,
        "trial_days_left": days_left,
        "pro_until": p_until,
        "points_config": group.get("points_config", DEFAULT_POINTS_CONFIG),
        "cash_categories": group.get("cash_categories", DEFAULT_CASH_CATEGORIES),
        "default_player_limit": group.get("default_player_limit", 14),
    }


# ---------------------------------------------------------------------------
# GET /api/groups/my
# ---------------------------------------------------------------------------
@router.get("/my")
async def my_groups(current=Depends(get_current_user_impl)):
    db = get_db()
    uid = ObjectId(current["id"])
    memberships = await db.memberships.find({"user_id": uid}).to_list(length=500)
    if not memberships:
        return []
    group_ids = [m["group_id"] for m in memberships]
    role_by_gid = {m["group_id"]: m["role"] for m in memberships}
    groups = await db.groups.find({"_id": {"$in": group_ids}}).to_list(length=500)
    out = []
    for g in groups:
        out.append(await _build_group_summary(g, current["id"], role_by_gid.get(g["_id"])))
    return out


# ---------------------------------------------------------------------------
# GET /api/groups/public  (marketplace / discover)
# ---------------------------------------------------------------------------
@router.get("/public")
async def public_groups(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[int] = Query(None, description="Radius in metres"),
    has_upcoming_matches: bool = False,
    skip: int = 0,
    limit: int = 50,
):
    db = get_db()
    query: dict = {}
    if lat is not None and lng is not None and radius:
        query["location.point"] = {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                "$maxDistance": radius,
            }
        }
    cursor = db.groups.find(query).skip(skip).limit(limit)
    out = []
    now = utc_now()
    async for g in cursor:
        upcoming_count = await db.matches.count_documents(
            {"group_id": g["_id"], "start_datetime": {"$gte": now}}
        )
        if has_upcoming_matches and upcoming_count == 0:
            continue
        next_match = await db.matches.find_one(
            {"group_id": g["_id"], "start_datetime": {"$gte": now}},
            sort=[("start_datetime", 1)],
        )
        members_cnt = await count_members(str(g["_id"]))
        out.append({
            "id": str(g["_id"]),
            "name": g.get("name"),
            "location": g.get("location"),
            "venue": g.get("venue"),
            "members_count": members_cnt,
            "upcoming_matches_count": upcoming_count,
            "next_match_date": (
                next_match["start_datetime"].isoformat()
                if next_match and hasattr(next_match.get("start_datetime"), "isoformat")
                else (next_match.get("start_datetime") if next_match else None)
            ),
        })
    return out


# ---------------------------------------------------------------------------
# POST /api/groups
# ---------------------------------------------------------------------------
@router.post("")
async def create_group(payload: CreateGroupRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Името е задължително")
    if payload.default_player_limit is not None:
        if payload.default_player_limit < 2 or payload.default_player_limit > 30:
            raise HTTPException(status_code=400, detail="default_player_limit трябва да е между 2 и 30")

    points_config = payload.points_config or DEFAULT_POINTS_CONFIG
    _validate_points_config(points_config)

    location = _ensure_location_point(payload.location) if payload.location else None

    # FREE plan limit: max 1 owned group
    owner_count = await count_owner_groups(current["id"])
    if owner_count >= FREE_MAX_GROUPS:
        # Allow second group only if user has any active PRO group? Per spec: FREE allows 1.
        raise HTTPException(
            status_code=400,
            detail="FREE план позволява 1 група. Активирай PRO.",
        )

    # entry_code
    entry_code = (payload.entry_code or "").strip().upper() or None
    if entry_code:
        if not (4 <= len(entry_code) <= 8) or not all(c.isalnum() for c in entry_code):
            raise HTTPException(status_code=400, detail="entry_code трябва да е 4-8 знака (A-Z, 0-9)")
        existing = await db.groups.find_one({"entry_code": entry_code})
        if existing:
            raise HTTPException(status_code=400, detail="Този код вече се използва")
    else:
        # generate unique
        for _ in range(8):
            candidate = _gen_entry_code(6)
            if not await db.groups.find_one({"entry_code": candidate}):
                entry_code = candidate
                break
        if not entry_code:
            raise HTTPException(status_code=500, detail="Неуспешно генериране на код")

    now = utc_now()
    group_doc = {
        "name": name,
        "entry_code": entry_code,
        "default_player_limit": payload.default_player_limit or 14,
        "location": location,
        "venue": payload.venue,
        "active_season_id": None,
        "points_config": points_config,
        "cash_categories": list(DEFAULT_CASH_CATEGORIES),
        "currency": CURRENCY,
        "created_at": now,
        "created_by_user_id": ObjectId(current["id"]),
    }
    result = await db.groups.insert_one(group_doc)
    group_id = result.inserted_id

    # creator becomes OWNER
    await db.memberships.insert_one({
        "group_id": group_id,
        "user_id": ObjectId(current["id"]),
        "role": ROLE_OWNER,
        "joined_at": now,
    })

    # 14-day PRO trial
    period_end = now + timedelta(days=14)
    await db.billing.insert_one({
        "group_id": group_id,
        "is_trial": True,
        "status": "active",
        "period_end": period_end,
        "created_at": now,
    })

    group = await db.groups.find_one({"_id": group_id})
    return await _build_group_summary(group, current["id"], ROLE_OWNER)


# ---------------------------------------------------------------------------
# POST /api/groups/join
# ---------------------------------------------------------------------------
@router.post("/join")
async def join_group(payload: JoinGroupRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    code = (payload.entry_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Кодът е задължителен")
    group = await db.groups.find_one({"entry_code": code})
    if not group:
        raise HTTPException(status_code=404, detail="Група с този код не съществува")

    uid = ObjectId(current["id"])
    existing = await db.memberships.find_one({"group_id": group["_id"], "user_id": uid})
    if existing:
        raise HTTPException(status_code=400, detail="Вече си член на тази група")

    await db.memberships.insert_one({
        "group_id": group["_id"],
        "user_id": uid,
        "role": ROLE_MEMBER,
        "joined_at": utc_now(),
    })

    if current.get("phone"):
        await merge_guest_records(current["phone"], current["id"])

    return await _build_group_summary(group, current["id"], ROLE_MEMBER)


# ---------------------------------------------------------------------------
# Preview by code (no auth) - MUST be declared BEFORE /{group_id}
# ---------------------------------------------------------------------------
@router.get("/preview-by-code")
async def preview_group_by_code(code: str = Query(..., min_length=3, max_length=12)):
    db = get_db()
    code = code.strip().upper()
    group = await db.groups.find_one({"entry_code": code})
    if not group:
        raise HTTPException(status_code=404, detail="Група не е намерена")
    members_cnt = await count_members(str(group["_id"]))
    return {
        "name": group.get("name"),
        "members_count": members_cnt,
        "location": group.get("location"),
        "venue": group.get("venue"),
    }


# ---------------------------------------------------------------------------
# GET /api/groups/{id}
# ---------------------------------------------------------------------------
@router.get("/{group_id}")
async def get_group(group_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    summary = await _build_group_summary(group, current["id"])
    summary["members_list"] = await list_members_with_users(group_id, include_guests=False)
    return summary


# ---------------------------------------------------------------------------
# PATCH /api/groups/{id}
# ---------------------------------------------------------------------------
@router.patch("/{group_id}")
async def update_group(group_id: str, payload: UpdateGroupRequest, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = ObjectId(group_id)

    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "points_config" in update:
        _validate_points_config(update["points_config"])
    if "location" in update and isinstance(update["location"], dict):
        update["location"] = _ensure_location_point(update["location"])
    if "default_player_limit" in update:
        if not (2 <= int(update["default_player_limit"]) <= 30):
            raise HTTPException(status_code=400, detail="default_player_limit трябва да е между 2 и 30")
    # forbid changing immutable fields
    for forbidden in ("entry_code", "created_by_user_id", "id", "_id"):
        update.pop(forbidden, None)

    if update:
        await db.groups.update_one({"_id": gid}, {"$set": update})

    group = await db.groups.find_one({"_id": gid})
    return await _build_group_summary(group, current["id"])


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@router.post("/{group_id}/categories")
async def add_category(group_id: str, payload: AddCategoryRequest, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = ObjectId(group_id)
    cat = (payload.category or "").strip().upper()
    if not cat:
        raise HTTPException(status_code=400, detail="category е задължителна")
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if cat in (group.get("cash_categories") or []):
        raise HTTPException(status_code=400, detail="Категорията вече съществува")
    await db.groups.update_one({"_id": gid}, {"$addToSet": {"cash_categories": cat}})
    if cat in (group.get("inactive_categories") or []):
        await db.groups.update_one({"_id": gid}, {"$pull": {"inactive_categories": cat}})
    updated = await db.groups.find_one({"_id": gid})
    return {"cash_categories": updated.get("cash_categories", []), "inactive_categories": updated.get("inactive_categories", [])}


@router.delete("/{group_id}/categories/{category}")
async def deactivate_category(group_id: str, category: str, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = ObjectId(group_id)
    cat = (category or "").strip().upper()
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if cat not in (group.get("cash_categories") or []):
        raise HTTPException(status_code=404, detail="Категорията не съществува")
    # mark inactive (do NOT remove, keep transactions valid)
    await db.groups.update_one({"_id": gid}, {"$addToSet": {"inactive_categories": cat}})
    updated = await db.groups.find_one({"_id": gid})
    return {
        "cash_categories": updated.get("cash_categories", []),
        "inactive_categories": updated.get("inactive_categories", []),
    }



