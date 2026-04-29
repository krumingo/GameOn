"""All match-related logic: CRUD, RSVP, teams draft, score, results, payments, recurrence.

ALL data (teams, score, results, payments) is EMBEDDED in the matches document.
There are NO separate collections for them. Only `rsvps` is a separate collection.
Currency: EUR everywhere.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    CreateMatchRequest,
    UpdateMatchRequest,
    CancelMatchRequest,
    RSVPRequest,
    RSVPGuestRequest,
    RSVPBulkRequest,
    RSVPRemoveRequest,
    RSVPApprovalRequest,
    MarkPaymentRequest,
    SetGoalsRequest,
    SetMatchScoreRequest,
    SetCaptainsRequest,
    PickPlayerRequest,
    TransferPlayerRequest,
    ReturnPlayerRequest,
    LockTeamsRequest,
    SetDraftVisibilityRequest,
    FREE_MAX_PLAYERS_PER_MATCH,
    ROLE_OWNER,
    ROLE_ORGANIZER,
    check_pro_access,
    get_current_user_impl,
    get_db,
    get_user_role_in_group,
    require_admin,
    require_owner,
    serialize_doc,
    utc_now,
)

logger = logging.getLogger(__name__)

# Two routers because the URL prefixes differ:
group_router = APIRouter(prefix="/api/groups", tags=["matches"])
match_router = APIRouter(prefix="/api/matches", tags=["matches"])
scheduler_router = APIRouter(prefix="/api/scheduler", tags=["matches"])

PRICING_MODES = {"FIXED", "SPLIT", "SPLIT_WITH_CASH", "CASH_PAYS_ALL"}
RECURRENCES = {"ONE_TIME", "WEEKLY"}
JOIN_MODES = {"AUTO", "APPROVAL"}
MATCH_STATUSES = {"UPCOMING", "COMPLETED", "CANCELLED"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Невалидна дата (ISO формат)")
    else:
        raise HTTPException(status_code=400, detail="Невалидна дата")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _ensure_aware(dt) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")


async def _get_match(match_id: str) -> dict:
    db = get_db()
    mid = await _oid(match_id)
    m = await db.matches.find_one({"_id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Мачът не е намерен")
    return m


async def _user_in_group(user_id: str, group_id) -> bool:
    db = get_db()
    try:
        uid = ObjectId(user_id)
        gid = group_id if isinstance(group_id, ObjectId) else ObjectId(group_id)
    except Exception:
        return False
    m = await db.memberships.find_one({"group_id": gid, "user_id": uid}, {"_id": 1})
    return m is not None


async def _resolve_player_name(db, user_id: Optional[ObjectId], guest_id: Optional[ObjectId]) -> str:
    if user_id:
        u = await db.users.find_one({"_id": user_id}, {"_id": 0, "name": 1, "nickname": 1})
        if u:
            return u.get("nickname") or u.get("name") or ""
    if guest_id:
        g = await db.guests.find_one({"_id": guest_id}, {"_id": 0, "name": 1})
        if g:
            return g.get("name", "")
    return ""


def _serialize_match(match: dict) -> dict:
    out = serialize_doc(match) or {}
    return out


async def _count_going(match_id: ObjectId) -> int:
    return await get_db().rsvps.count_documents({"match_id": match_id, "status": "going"})


async def _count_waitlist(match_id: ObjectId) -> int:
    return await get_db().rsvps.count_documents({"match_id": match_id, "status": "waitlist"})


async def _count_pending(match_id: ObjectId) -> int:
    return await get_db().rsvps.count_documents({"match_id": match_id, "status": "pending"})


async def _total_participants(match: dict) -> int:
    """Count of going RSVPs (users + guests) for capacity & SPLIT calcs."""
    return await _count_going(match["_id"])


def _compute_planned_price(pricing_mode: str, total_cost: float, price_per_player: float, player_limit: int) -> float:
    if pricing_mode == "SPLIT":
        if player_limit and total_cost:
            return round(total_cost / player_limit, 2)
        return 0.0
    if pricing_mode == "FIXED":
        return float(price_per_player or 0)
    if pricing_mode == "SPLIT_WITH_CASH":
        return float(price_per_player or 0)
    if pricing_mode == "CASH_PAYS_ALL":
        return 0.0
    return 0.0


async def _recalc_split_price(match: dict) -> float:
    """For SPLIT pricing, set price_per_player = total_cost / total_participants."""
    if match.get("pricing_mode") != "SPLIT":
        return float(match.get("price_per_player") or 0)
    going = await _total_participants(match)
    total_cost = float(match.get("total_cost") or 0)
    if going > 0 and total_cost > 0:
        new_price = round(total_cost / going, 2)
    else:
        new_price = 0.0
    if new_price != match.get("price_per_player"):
        await get_db().matches.update_one(
            {"_id": match["_id"]}, {"$set": {"price_per_player": new_price}}
        )
        match["price_per_player"] = new_price
    return new_price


async def _match_summary(match: dict, current_user_id: Optional[str] = None) -> dict:
    db = get_db()
    going = await _count_going(match["_id"])
    waitlist = await _count_waitlist(match["_id"])
    pending = await _count_pending(match["_id"])
    player_limit = int(match.get("player_limit") or 14)
    free_spots = max(0, player_limit - going)

    user_rsvp_status = None
    if current_user_id:
        try:
            uid = ObjectId(current_user_id)
            r = await db.rsvps.find_one(
                {"match_id": match["_id"], "user_id": uid}, {"_id": 0, "status": 1}
            )
            if r:
                user_rsvp_status = r.get("status")
        except Exception:
            pass

    return {
        "going_count": going,
        "free_spots": free_spots,
        "waitlist_count": waitlist,
        "pending_count": pending,
        "price_per_player": float(match.get("price_per_player") or 0),
        "user_rsvp_status": user_rsvp_status,
    }


# ---------------------------------------------------------------------------
# Reliability score on late cancellation
# ---------------------------------------------------------------------------
async def _apply_late_cancellation(user_id: ObjectId, match: dict) -> None:
    """If the match starts in <2h, mark a late_cancellation and recompute score."""
    db = get_db()
    start = _ensure_aware(match.get("start_datetime"))
    if not start:
        return
    if (start - utc_now()).total_seconds() > 2 * 3600:
        return
    user = await db.users.find_one({"_id": user_id})
    if not user:
        return
    stats = user.get("reliability_stats") or {
        "total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0
    }
    stats["late_cancellations"] = int(stats.get("late_cancellations", 0)) + 1
    going = max(int(stats.get("total_rsvp_going", 0)), 1)
    attended = int(stats.get("total_attended", 0))
    raw = (attended / going) * 100 - stats["late_cancellations"] * 5
    score = int(max(0, min(100, round(raw))))
    await db.users.update_one(
        {"_id": user_id},
        {"$set": {"reliability_stats": stats, "reliability_score": score}},
    )


# ---------------------------------------------------------------------------
# RSVP helpers
# ---------------------------------------------------------------------------
async def _auto_promote_waitlist(match: dict) -> Optional[dict]:
    """If a player drops, promote the first waitlist entry to going."""
    db = get_db()
    going = await _count_going(match["_id"])
    player_limit = int(match.get("player_limit") or 14)
    if going >= player_limit:
        return None
    next_wl = await db.rsvps.find_one(
        {"match_id": match["_id"], "status": "waitlist"},
        sort=[("waitlist_position", 1), ("created_at", 1)],
    )
    if not next_wl:
        return None
    await db.rsvps.update_one(
        {"_id": next_wl["_id"]},
        {"$set": {"status": "going", "waitlist_position": None, "updated_at": utc_now()}},
    )
    return next_wl


# ---------------------------------------------------------------------------
# ========== MATCHES CRUD ==========
# ---------------------------------------------------------------------------
@group_router.post("/{group_id}/matches")
async def create_match(group_id: str, payload: CreateMatchRequest, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = await _oid(group_id)
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Групата не е намерена")

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Името е задължително")

    start_dt = _parse_dt(payload.start_datetime)
    if start_dt <= utc_now():
        raise HTTPException(status_code=400, detail="Датата трябва да е в бъдещето")

    if payload.pricing_mode not in PRICING_MODES:
        raise HTTPException(status_code=400, detail="Невалиден pricing_mode")
    if payload.recurrence not in RECURRENCES:
        raise HTTPException(status_code=400, detail="Невалидна recurrence")
    if payload.join_mode not in JOIN_MODES:
        raise HTTPException(status_code=400, detail="Невалиден join_mode")

    player_limit = int(payload.player_limit or group.get("default_player_limit") or 14)
    if player_limit < 2 or player_limit > 30:
        raise HTTPException(status_code=400, detail="player_limit трябва да е между 2 и 30")

    # FREE plan cap on player_limit
    from deps import get_group_plan
    plan = await get_group_plan(group_id)
    if plan == "FREE":
        player_limit = min(player_limit, FREE_MAX_PLAYERS_PER_MATCH)

    total_cost = float(payload.total_cost or 0)
    price_per_player = float(payload.price_per_player or 0)
    planned_price = _compute_planned_price(payload.pricing_mode, total_cost, price_per_player, player_limit)

    recurrence_series_id = None
    recurrence_active = False
    if payload.recurrence == "WEEKLY":
        recurrence_series_id = str(uuid.uuid4())
        recurrence_active = True

    now = utc_now()
    doc = {
        "group_id": gid,
        "name": name,
        "venue": payload.venue,
        "location_link": payload.location_link,
        "start_datetime": start_dt,
        "player_limit": player_limit,
        "status": "UPCOMING",
        "cancel_reason": None,
        "cancelled_at": None,
        "cancelled_by_user_id": None,
        "pricing_mode": payload.pricing_mode,
        "total_cost": total_cost,
        "price_per_player": planned_price if payload.pricing_mode in ("FIXED", "SPLIT_WITH_CASH") else 0.0,
        "planned_price_per_player": planned_price,
        "join_mode": payload.join_mode,
        "recurrence": payload.recurrence,
        "recurrence_series_id": recurrence_series_id,
        "recurrence_active": recurrence_active,
        "recurrence_source_id": None,
        "season_id": group.get("active_season_id"),
        "teams_data": {
            "blue_captain_id": None,
            "red_captain_id": None,
            "blue_team": [],
            "red_team": [],
            "turn": "BLUE",
            "pick_order": [],
            "locked": False,
            "draft_visible": False,
        },
        "score_data": {
            "blue_goals": 0,
            "red_goals": 0,
            "updated_at": None,
            "updated_by_user_id": None,
        },
        "player_results": [],
        "player_payments": [],
        "guest_count": 0,
        "cash_contribution": 0.0,
        "created_at": now,
        "created_by_user_id": ObjectId(current["id"]),
    }
    res = await db.matches.insert_one(doc)
    saved = await db.matches.find_one({"_id": res.inserted_id})
    out = _serialize_match(saved)
    out.update(await _match_summary(saved, current["id"]))
    # Fire-and-forget push notification: new match
    try:
        from services.push_service import get_group_push_tokens, send_push_batch
        when = saved["start_datetime"].strftime("%d.%m %H:%M") if hasattr(saved.get("start_datetime"), "strftime") else ""
        tokens = await get_group_push_tokens(
            group_id, exclude_user_id=current["id"], pref_key="new_matches",
        )
        if tokens:
            await send_push_batch(
                tokens,
                title="Нов мач",
                body=f"{saved.get('name') or 'Мач'} — {when}",
                data={"type": "match", "group_id": group_id, "match_id": str(saved["_id"])},
                channel_id="matches",
            )
    except Exception as _e:
        logger.warning(f"Push (new_match) failed: {_e}")
    return out


@group_router.get("/{group_id}/matches")
async def list_upcoming_matches(group_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    gid = await _oid(group_id)
    now = utc_now()
    cursor = db.matches.find({
        "group_id": gid,
        "status": {"$ne": "CANCELLED"},
        "start_datetime": {"$gte": now},
    }).sort("start_datetime", 1)
    out = []
    async for m in cursor:
        s = _serialize_match(m)
        s.update(await _match_summary(m, current["id"]))
        out.append(s)
    return out


@group_router.get("/{group_id}/matches/history")
async def list_history_matches(
    group_id: str,
    skip: int = 0,
    limit: int = 50,
    current=Depends(get_current_user_impl),
):
    db = get_db()
    gid = await _oid(group_id)
    now = utc_now()
    query = {
        "group_id": gid,
        "$or": [
            {"start_datetime": {"$lt": now}},
            {"status": "COMPLETED"},
            {"status": "CANCELLED"},
        ],
    }
    cursor = db.matches.find(query).sort("start_datetime", -1).skip(skip).limit(limit)
    out = []
    async for m in cursor:
        s = _serialize_match(m)
        s.update(await _match_summary(m, current["id"]))
        out.append(s)
    return out


@match_router.get("/{match_id}")
async def get_match(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    s = _serialize_match(match)
    s.update(await _match_summary(match, current["id"]))

    rsvps = []
    async for r in db.rsvps.find({"match_id": match["_id"]}).sort("created_at", 1):
        name = await _resolve_player_name(db, r.get("user_id"), r.get("guest_id"))
        rsvps.append({
            "id": str(r["_id"]),
            "user_id": str(r["user_id"]) if r.get("user_id") else None,
            "guest_id": str(r["guest_id"]) if r.get("guest_id") else None,
            "name": name,
            "status": r.get("status"),
            "is_guest": bool(r.get("is_guest")),
            "waitlist_position": r.get("waitlist_position"),
            "created_at": r["created_at"].isoformat() if hasattr(r.get("created_at"), "isoformat") else r.get("created_at"),
        })
    s["rsvps"] = rsvps
    return s


@match_router.patch("/{match_id}")
async def update_match(match_id: str, payload: UpdateMatchRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))

    update: dict = {}
    body = payload.model_dump(exclude_unset=True)

    if "name" in body and body["name"] is not None:
        update["name"] = body["name"].strip()
    if "venue" in body:
        update["venue"] = body["venue"]
    if "location_link" in body:
        update["location_link"] = body["location_link"]
    if "start_datetime" in body and body["start_datetime"]:
        update["start_datetime"] = _parse_dt(body["start_datetime"])
    if "recurrence" in body and body["recurrence"]:
        if body["recurrence"] not in RECURRENCES:
            raise HTTPException(status_code=400, detail="Невалидна recurrence")
        update["recurrence"] = body["recurrence"]
        if body["recurrence"] == "WEEKLY" and not match.get("recurrence_series_id"):
            update["recurrence_series_id"] = str(uuid.uuid4())
            update["recurrence_active"] = True
        if body["recurrence"] == "ONE_TIME":
            update["recurrence_active"] = False
    if "join_mode" in body and body["join_mode"]:
        if body["join_mode"] not in JOIN_MODES:
            raise HTTPException(status_code=400, detail="Невалиден join_mode")
        update["join_mode"] = body["join_mode"]
    if "status" in body and body["status"]:
        if body["status"] not in MATCH_STATUSES:
            raise HTTPException(status_code=400, detail="Невалиден status")
        update["status"] = body["status"]
    if "pricing_mode" in body and body["pricing_mode"]:
        if body["pricing_mode"] not in PRICING_MODES:
            raise HTTPException(status_code=400, detail="Невалиден pricing_mode")
        update["pricing_mode"] = body["pricing_mode"]
    if "total_cost" in body and body["total_cost"] is not None:
        update["total_cost"] = float(body["total_cost"])
    if "price_per_player" in body and body["price_per_player"] is not None:
        update["price_per_player"] = float(body["price_per_player"])
    if "player_limit" in body and body["player_limit"] is not None:
        new_limit = int(body["player_limit"])
        if new_limit < 2 or new_limit > 30:
            raise HTTPException(status_code=400, detail="player_limit трябва да е между 2 и 30")
        from deps import get_group_plan
        plan = await get_group_plan(str(match["group_id"]))
        if plan == "FREE" and new_limit > FREE_MAX_PLAYERS_PER_MATCH:
            raise HTTPException(status_code=400, detail=f"FREE план: макс {FREE_MAX_PLAYERS_PER_MATCH} играчи")
        going = await _count_going(match["_id"])
        if new_limit < going:
            raise HTTPException(status_code=400, detail=f"Вече има {going} записани, не може лимит {new_limit}")
        update["player_limit"] = new_limit

    if update:
        await db.matches.update_one({"_id": match["_id"]}, {"$set": update})

    # Recalc planned_price after total_cost / pricing_mode / player_limit changes
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    new_plan = _compute_planned_price(
        refreshed.get("pricing_mode") or "SPLIT",
        float(refreshed.get("total_cost") or 0),
        float(refreshed.get("price_per_player") or 0),
        int(refreshed.get("player_limit") or 14),
    )
    set_extra: dict = {"planned_price_per_player": new_plan}
    if refreshed.get("pricing_mode") in ("FIXED", "CASH_PAYS_ALL", "SPLIT_WITH_CASH"):
        set_extra["price_per_player"] = new_plan if refreshed.get("pricing_mode") != "SPLIT_WITH_CASH" else float(refreshed.get("price_per_player") or 0)
    await db.matches.update_one({"_id": match["_id"]}, {"$set": set_extra})
    if refreshed.get("pricing_mode") == "SPLIT":
        refreshed = await db.matches.find_one({"_id": match["_id"]})
        await _recalc_split_price(refreshed)

    saved = await db.matches.find_one({"_id": match["_id"]})
    out = _serialize_match(saved)
    out.update(await _match_summary(saved, current["id"]))
    return out


@match_router.post("/{match_id}/cancel")
async def cancel_match(match_id: str, payload: CancelMatchRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))

    await db.matches.update_one(
        {"_id": match["_id"]},
        {"$set": {
            "status": "CANCELLED",
            "cancel_reason": (payload.reason or "").strip() or None,
            "cancelled_at": utc_now(),
            "cancelled_by_user_id": ObjectId(current["id"]),
        }},
    )
    saved = await db.matches.find_one({"_id": match["_id"]})
    out = _serialize_match(saved)
    out.update(await _match_summary(saved, current["id"]))
    # Fire-and-forget push notification: match cancelled — notify all 'going' players
    try:
        from services.push_service import get_user_push_tokens_for_match, send_push_batch
        reason = (payload.reason or "").strip()
        body = f"{saved.get('name') or 'Мач'}: {reason}" if reason else f"{saved.get('name') or 'Мач'} е отменен"
        tokens = await get_user_push_tokens_for_match(
            match, exclude_user_id=current["id"], rsvp_status="going", pref_key="new_matches",
        )
        if tokens:
            await send_push_batch(
                tokens,
                title="Мач отменен",
                body=body,
                data={"type": "match", "group_id": str(match["group_id"]), "match_id": str(match["_id"])},
                channel_id="matches",
            )
    except Exception as _e:
        logger.warning(f"Push (cancel) failed: {_e}")
    return out


# ---------------------------------------------------------------------------
# ========== RSVP ==========
# ---------------------------------------------------------------------------
async def _create_or_update_rsvp(match: dict, *, user_id: Optional[ObjectId], guest_id: Optional[ObjectId],
                                  status: str, added_by: Optional[ObjectId] = None,
                                  bypass_join_mode: bool = False) -> dict:
    """Idempotent: if an rsvp already exists for (match, user_id|guest_id) update; else insert."""
    db = get_db()
    is_guest = guest_id is not None
    now = utc_now()

    # Locate existing rsvp
    q: dict = {"match_id": match["_id"]}
    if user_id:
        q["user_id"] = user_id
    elif guest_id:
        q["guest_id"] = guest_id

    existing = await db.rsvps.find_one(q)

    target_status = status
    waitlist_position = None

    if status == "going":
        going_now = await _count_going(match["_id"])
        # If existing was already going we don't double-count for limit check
        if existing and existing.get("status") == "going":
            going_now -= 1
        player_limit = int(match.get("player_limit") or 14)

        join_mode = match.get("join_mode") or "AUTO"
        if join_mode == "APPROVAL" and not bypass_join_mode:
            if going_now < player_limit:
                target_status = "going"
            else:
                target_status = "waitlist"
                waitlist_position = await _count_waitlist(match["_id"]) + 1
            # Non-admin via APPROVAL → pending; the caller controls bypass
            if not bypass_join_mode and not is_guest:
                target_status = "pending"
                waitlist_position = None
        else:
            if going_now < player_limit:
                target_status = "going"
            else:
                target_status = "waitlist"
                waitlist_position = await _count_waitlist(match["_id"]) + 1

    if existing:
        update = {
            "status": target_status,
            "waitlist_position": waitlist_position,
            "updated_at": now,
        }
        if added_by:
            update["added_by"] = added_by
        await db.rsvps.update_one({"_id": existing["_id"]}, {"$set": update})
        rsvp = await db.rsvps.find_one({"_id": existing["_id"]})
    else:
        doc = {
            "match_id": match["_id"],
            "user_id": user_id,
            "guest_id": guest_id,
            "is_guest": is_guest,
            "status": target_status,
            "waitlist_position": waitlist_position,
            "added_by": added_by,
            "removed_by": None,
            "created_at": now,
            "updated_at": now,
        }
        res = await db.rsvps.insert_one(doc)
        rsvp = await db.rsvps.find_one({"_id": res.inserted_id})

    return rsvp


def _rsvp_response(rsvp: dict) -> dict:
    return {
        "id": str(rsvp["_id"]),
        "user_id": str(rsvp["user_id"]) if rsvp.get("user_id") else None,
        "guest_id": str(rsvp["guest_id"]) if rsvp.get("guest_id") else None,
        "is_guest": bool(rsvp.get("is_guest")),
        "status": rsvp.get("status"),
        "waitlist_position": rsvp.get("waitlist_position"),
    }


@match_router.post("/{match_id}/rsvp")
async def rsvp(match_id: str, payload: RSVPRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    if match.get("status") == "CANCELLED":
        raise HTTPException(status_code=400, detail="Мачът е отменен")

    if payload.status not in ("going", "not_going"):
        raise HTTPException(status_code=400, detail="status трябва да е 'going' или 'not_going'")

    if not await _user_in_group(current["id"], match["group_id"]):
        raise HTTPException(status_code=403, detail="Не си член на групата")

    uid = ObjectId(current["id"])
    bypass = False
    role = await get_user_role_in_group(current["id"], str(match["group_id"]))
    if role in (ROLE_OWNER, ROLE_ORGANIZER):
        bypass = True

    if payload.status == "going":
        rsvp_doc = await _create_or_update_rsvp(
            match, user_id=uid, guest_id=None, status="going", bypass_join_mode=bypass
        )
        await _recalc_split_price(match)
    else:
        # not_going
        rsvp_doc = await _create_or_update_rsvp(
            match, user_id=uid, guest_id=None, status="not_going", bypass_join_mode=True
        )
        await _apply_late_cancellation(uid, match)
        await _auto_promote_waitlist(match)
        await _recalc_split_price(match)

    refreshed = await db.matches.find_one({"_id": match["_id"]})
    # Fire-and-forget push notification
    try:
        from services.push_service import get_group_push_tokens, send_push_batch
        user = await db.users.find_one({"_id": uid}, {"_id": 0, "name": 1})
        user_name = (user or {}).get("name") or "Играч"
        match_name = match.get("name") or "мач"
        verb = "се записа за" if payload.status == "going" else "се отписа от"
        tokens = await get_group_push_tokens(
            str(match["group_id"]), exclude_user_id=current["id"], pref_key="rsvp_changes",
        )
        if tokens:
            await send_push_batch(
                tokens,
                title="RSVP промяна",
                body=f"{user_name} {verb} {match_name}",
                data={"type": "match", "group_id": str(match["group_id"]), "match_id": str(match["_id"])},
                channel_id="matches",
            )
    except Exception as _e:
        logger.warning(f"Push (rsvp) failed: {_e}")
    return {
        "rsvp": _rsvp_response(rsvp_doc),
        "match_summary": await _match_summary(refreshed, current["id"]),
    }


@match_router.post("/{match_id}/rsvp-guest")
async def rsvp_guest(match_id: str, payload: RSVPGuestRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    if match.get("status") == "CANCELLED":
        raise HTTPException(status_code=400, detail="Мачът е отменен")
    await require_admin(current["id"], str(match["group_id"]))
    if payload.status not in ("going", "not_going"):
        raise HTTPException(status_code=400, detail="status трябва да е 'going' или 'not_going'")
    gid = await _oid(payload.guest_id)
    guest = await db.guests.find_one({"_id": gid, "group_id": match["group_id"]})
    if not guest:
        raise HTTPException(status_code=404, detail="Гостът не е намерен")

    rsvp_doc = await _create_or_update_rsvp(
        match, user_id=None, guest_id=gid, status=payload.status,
        added_by=ObjectId(current["id"]), bypass_join_mode=True,
    )
    if payload.status == "not_going":
        await _auto_promote_waitlist(match)
    # update guest_count: count rsvps with is_guest=true and status=going
    guest_going = await db.rsvps.count_documents(
        {"match_id": match["_id"], "is_guest": True, "status": "going"}
    )
    await db.matches.update_one({"_id": match["_id"]}, {"$set": {"guest_count": guest_going}})
    await _recalc_split_price(match)
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return {
        "rsvp": _rsvp_response(rsvp_doc),
        "match_summary": await _match_summary(refreshed, current["id"]),
    }


@match_router.post("/{match_id}/rsvp-bulk")
async def rsvp_bulk(match_id: str, payload: RSVPBulkRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))
    if payload.status not in ("going", "not_going"):
        raise HTTPException(status_code=400, detail="status трябва да е 'going' или 'not_going'")

    added = []
    skipped = []
    for uid_str in payload.user_ids:
        try:
            uid = ObjectId(uid_str)
        except Exception:
            skipped.append({"user_id": uid_str, "reason": "invalid id"})
            continue
        if not await _user_in_group(uid_str, match["group_id"]):
            skipped.append({"user_id": uid_str, "reason": "not member"})
            continue
        rsvp_doc = await _create_or_update_rsvp(
            match, user_id=uid, guest_id=None, status=payload.status,
            added_by=ObjectId(current["id"]), bypass_join_mode=True,
        )
        added.append(_rsvp_response(rsvp_doc))

    await _recalc_split_price(match)
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return {
        "added": added,
        "skipped": skipped,
        "match_summary": await _match_summary(refreshed, current["id"]),
    }


@match_router.post("/{match_id}/rsvp-remove")
async def rsvp_remove(match_id: str, payload: RSVPRemoveRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))
    uid = await _oid(payload.user_id)
    existing = await db.rsvps.find_one({"match_id": match["_id"], "user_id": uid})
    if not existing:
        raise HTTPException(status_code=404, detail="RSVP не е намерен")
    await db.rsvps.update_one(
        {"_id": existing["_id"]},
        {"$set": {
            "status": "not_going",
            "waitlist_position": None,
            "removed_by": ObjectId(current["id"]),
            "updated_at": utc_now(),
        }},
    )
    await _auto_promote_waitlist(match)
    await _recalc_split_price(match)
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return {"removed": True, "match_summary": await _match_summary(refreshed, current["id"])}


@match_router.get("/{match_id}/rsvps")
async def list_rsvps(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    out = []
    async for r in db.rsvps.find({"match_id": match["_id"]}).sort("created_at", 1):
        name = await _resolve_player_name(db, r.get("user_id"), r.get("guest_id"))
        out.append({
            "id": str(r["_id"]),
            "user_id": str(r["user_id"]) if r.get("user_id") else None,
            "guest_id": str(r["guest_id"]) if r.get("guest_id") else None,
            "name": name,
            "is_guest": bool(r.get("is_guest")),
            "status": r.get("status"),
            "waitlist_position": r.get("waitlist_position"),
            "created_at": r["created_at"].isoformat() if hasattr(r.get("created_at"), "isoformat") else r.get("created_at"),
        })
    return out


@match_router.get("/{match_id}/pending-requests")
async def pending_requests(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))
    out = []
    async for r in db.rsvps.find({"match_id": match["_id"], "status": "pending"}).sort("created_at", 1):
        name = await _resolve_player_name(db, r.get("user_id"), r.get("guest_id"))
        out.append({
            "id": str(r["_id"]),
            "user_id": str(r["user_id"]) if r.get("user_id") else None,
            "name": name,
        })
    return out


@match_router.get("/{match_id}/waitlist")
async def waitlist(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    out = []
    async for r in db.rsvps.find(
        {"match_id": match["_id"], "status": "waitlist"}
    ).sort([("waitlist_position", 1), ("created_at", 1)]):
        name = await _resolve_player_name(db, r.get("user_id"), r.get("guest_id"))
        out.append({
            "id": str(r["_id"]),
            "user_id": str(r["user_id"]) if r.get("user_id") else None,
            "name": name,
            "waitlist_position": r.get("waitlist_position"),
        })
    return out


@match_router.post("/{match_id}/approve-request")
async def approve_request(match_id: str, payload: RSVPApprovalRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))
    uid = await _oid(payload.user_id)
    existing = await db.rsvps.find_one({"match_id": match["_id"], "user_id": uid})
    if not existing:
        raise HTTPException(status_code=404, detail="Заявката не е намерена")

    if payload.action == "approve":
        going = await _count_going(match["_id"])
        player_limit = int(match.get("player_limit") or 14)
        if going < player_limit:
            new_status = "going"
            wl_pos = None
        else:
            new_status = "waitlist"
            wl_pos = await _count_waitlist(match["_id"]) + 1
        await db.rsvps.update_one(
            {"_id": existing["_id"]},
            {"$set": {"status": new_status, "waitlist_position": wl_pos, "updated_at": utc_now()}},
        )
        await _recalc_split_price(match)
        return {"status": new_status}
    elif payload.action == "reject":
        await db.rsvps.update_one(
            {"_id": existing["_id"]}, {"$set": {"status": "rejected", "updated_at": utc_now()}}
        )
        return {"status": "rejected"}
    else:
        raise HTTPException(status_code=400, detail="action трябва да е 'approve' или 'reject'")


# ---------------------------------------------------------------------------
# ========== PAYMENTS (PRO) ==========
# ---------------------------------------------------------------------------
async def _build_payments_per_player(match: dict) -> Tuple[list[dict], dict]:
    """Build the per_player list and totals dict using current going RSVPs and embedded payments."""
    db = get_db()
    pricing_mode = match.get("pricing_mode") or "SPLIT"
    total_cost = float(match.get("total_cost") or 0)
    fixed_pp = float(match.get("price_per_player") or 0)
    going_rsvps = await db.rsvps.find({"match_id": match["_id"], "status": "going"}).to_list(length=200)
    total_participants = len(going_rsvps)

    # determine price_per_player
    if pricing_mode == "SPLIT":
        price_pp = round(total_cost / total_participants, 2) if total_participants > 0 else 0.0
        cash_contribution = 0.0
    elif pricing_mode == "FIXED":
        price_pp = fixed_pp
        cash_contribution = 0.0
    elif pricing_mode == "SPLIT_WITH_CASH":
        price_pp = fixed_pp
        cash_contribution = round(max(0.0, total_cost - price_pp * total_participants), 2)
    elif pricing_mode == "CASH_PAYS_ALL":
        price_pp = 0.0
        cash_contribution = total_cost
    else:
        price_pp = 0.0
        cash_contribution = 0.0

    payments_idx = {}
    for p in (match.get("player_payments") or []):
        key = ("u", str(p.get("user_id"))) if p.get("user_id") else ("g", str(p.get("guest_id")))
        payments_idx[key] = p

    per_player = []
    collected_total = 0.0
    for r in going_rsvps:
        uid = r.get("user_id")
        gid = r.get("guest_id")
        is_guest = bool(r.get("is_guest"))
        name = await _resolve_player_name(db, uid, gid)
        key = ("u", str(uid)) if uid else ("g", str(gid))
        existing_p = payments_idx.get(key) or {}
        paid_amount = float(existing_p.get("paid_amount") or 0)
        amount = float(existing_p.get("amount") or price_pp)
        if existing_p.get("status") in ("UNPAID", "PAID", "OVERPAID"):
            status = existing_p.get("status")
        else:
            status = "UNPAID"
        if status == "PAID" or status == "OVERPAID":
            collected_total += paid_amount
        overpaid = float(existing_p.get("overpaid_to_cash") or 0)
        per_player.append({
            "user_id": str(uid) if uid else None,
            "guest_id": str(gid) if gid else None,
            "name": name,
            "is_guest": is_guest,
            "amount": round(amount, 2),
            "paid_amount": round(paid_amount, 2),
            "status": status,
            "overpaid_to_cash": round(overpaid, 2),
            "paid_at": existing_p.get("paid_at").isoformat() if hasattr(existing_p.get("paid_at"), "isoformat") else existing_p.get("paid_at"),
        })

    expected_from_players = round(price_pp * total_participants, 2)
    outstanding_total = round(max(0.0, expected_from_players - collected_total), 2)

    totals = {
        "pricing_mode": pricing_mode,
        "total_cost": round(total_cost, 2),
        "going_count": await _count_going(match["_id"]),
        "guest_count": int(match.get("guest_count") or 0),
        "total_participants": total_participants,
        "price_per_player": round(price_pp, 2),
        "cash_contribution": round(cash_contribution, 2),
        "currency": "EUR",
        "expected_from_players": expected_from_players,
        "collected_total": round(collected_total, 2),
        "outstanding_total": outstanding_total,
    }
    return per_player, totals


@match_router.get("/{match_id}/payments")
async def get_payments(match_id: str, current=Depends(get_current_user_impl)):
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    per_player, totals = await _build_payments_per_player(match)
    return {**totals, "per_player": per_player}


@match_router.post("/{match_id}/payments/mark")
async def mark_payment(match_id: str, payload: MarkPaymentRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    if payload.status not in ("PAID", "UNPAID"):
        raise HTTPException(status_code=400, detail="status трябва да е 'PAID' или 'UNPAID'")
    if not payload.user_id and not payload.guest_id:
        raise HTTPException(status_code=400, detail="user_id или guest_id е задължителен")

    # determine current price_per_player from a recompute (without persistence)
    _, totals = await _build_payments_per_player(match)
    current_price = float(totals["price_per_player"])
    amount = float(payload.amount) if payload.amount is not None else current_price

    paid_amount = float(payload.paid_amount or 0) if payload.status == "PAID" else 0.0
    if payload.status == "UNPAID":
        new_status = "UNPAID"
        overpaid = 0.0
    elif paid_amount > amount:
        new_status = "OVERPAID"
        overpaid = round(paid_amount - amount, 2)
    elif paid_amount == amount and amount > 0:
        new_status = "PAID"
        overpaid = 0.0
    elif paid_amount > 0:
        # Partial: treat as PAID with paid_amount stored
        new_status = "PAID"
        overpaid = 0.0
    else:
        new_status = "UNPAID"
        overpaid = 0.0

    # build the entry
    entry = {
        "user_id": ObjectId(payload.user_id) if payload.user_id else None,
        "guest_id": ObjectId(payload.guest_id) if payload.guest_id else None,
        "name": await _resolve_player_name(
            db,
            ObjectId(payload.user_id) if payload.user_id else None,
            ObjectId(payload.guest_id) if payload.guest_id else None,
        ),
        "amount": round(amount, 2),
        "paid_amount": round(paid_amount, 2),
        "status": new_status,
        "overpaid_to_cash": overpaid,
        "paid_at": utc_now() if new_status in ("PAID", "OVERPAID") else None,
        "marked_by": ObjectId(current["id"]),
    }

    # remove any prior entry for this user/guest then push new
    if payload.user_id:
        await db.matches.update_one(
            {"_id": match["_id"]},
            {"$pull": {"player_payments": {"user_id": ObjectId(payload.user_id)}}},
        )
    if payload.guest_id:
        await db.matches.update_one(
            {"_id": match["_id"]},
            {"$pull": {"player_payments": {"guest_id": ObjectId(payload.guest_id)}}},
        )
    await db.matches.update_one(
        {"_id": match["_id"]}, {"$push": {"player_payments": entry}}
    )

    refreshed = await db.matches.find_one({"_id": match["_id"]})
    per_player, totals = await _build_payments_per_player(refreshed)
    return {**totals, "per_player": per_player}


@match_router.post("/{match_id}/payments/record-to-cash")
async def record_to_cash(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    _, totals = await _build_payments_per_player(match)
    collected = float(totals["collected_total"])
    cash_contribution = float(totals["cash_contribution"])

    now = utc_now()
    note = f"Мач: {match.get('name')}, {match.get('start_datetime').isoformat() if hasattr(match.get('start_datetime'), 'isoformat') else match.get('start_datetime')}"

    txns = []
    if collected > 0:
        income = {
            "group_id": match["group_id"],
            "type": "INCOME",
            "category": "MATCH_FEES",
            "amount": round(collected, 2),
            "currency": "EUR",
            "match_id": match["_id"],
            "note": note,
            "created_at": now,
            "created_by_user_id": ObjectId(current["id"]),
        }
        res = await db.cash_transactions.insert_one(income)
        txns.append({"id": str(res.inserted_id), "type": "INCOME", "amount": income["amount"]})

    if match.get("pricing_mode") == "SPLIT_WITH_CASH" and cash_contribution > 0:
        expense = {
            "group_id": match["group_id"],
            "type": "EXPENSE",
            "category": "PITCH_PAYMENT",
            "amount": round(cash_contribution, 2),
            "currency": "EUR",
            "match_id": match["_id"],
            "note": f"{note} (доплащане от каса)",
            "created_at": now,
            "created_by_user_id": ObjectId(current["id"]),
        }
        res = await db.cash_transactions.insert_one(expense)
        txns.append({"id": str(res.inserted_id), "type": "EXPENSE", "amount": expense["amount"]})

    return {"recorded": True, "transactions": txns}


# ---------------------------------------------------------------------------
# ========== RESULTS (PRO) — score + per-player goals ==========
# ---------------------------------------------------------------------------
def _player_team(match: dict, user_id: Optional[str], guest_id: Optional[str]) -> Optional[str]:
    td = match.get("teams_data") or {}
    target = ("u", str(user_id)) if user_id else ("g", str(guest_id)) if guest_id else None
    if not target:
        return None
    for entry in td.get("blue_team") or []:
        ek = ("u", str(entry.get("user_id"))) if entry.get("user_id") else ("g", str(entry.get("guest_id")))
        if ek == target:
            return "BLUE"
    for entry in td.get("red_team") or []:
        ek = ("u", str(entry.get("user_id"))) if entry.get("user_id") else ("g", str(entry.get("guest_id")))
        if ek == target:
            return "RED"
    return None


def _sum_individual_goals(match: dict, team: str) -> int:
    return sum(int(p.get("goals") or 0) for p in (match.get("player_results") or []) if p.get("team") == team)


@match_router.get("/{match_id}/results")
async def get_results(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))

    players = []
    for p in (match.get("player_results") or []):
        uid = p.get("user_id")
        gid = p.get("guest_id")
        name = await _resolve_player_name(db, uid, gid)
        players.append({
            "user_id": str(uid) if uid else None,
            "guest_id": str(gid) if gid else None,
            "name": name,
            "goals": int(p.get("goals") or 0),
            "team": p.get("team"),
            "is_guest": bool(p.get("is_guest")),
        })

    return {
        "score": {
            "blue_goals": int((match.get("score_data") or {}).get("blue_goals") or 0),
            "red_goals": int((match.get("score_data") or {}).get("red_goals") or 0),
        },
        "players": players,
        "total_blue_individual_goals": _sum_individual_goals(match, "BLUE"),
        "total_red_individual_goals": _sum_individual_goals(match, "RED"),
    }


@match_router.post("/{match_id}/results/set-goals")
async def set_goals(match_id: str, payload: SetGoalsRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))

    if payload.goals < 0:
        raise HTTPException(status_code=400, detail="goals трябва да е >= 0")
    if not payload.user_id and not payload.guest_id:
        raise HTTPException(status_code=400, detail="user_id или guest_id е задължителен")

    role = await get_user_role_in_group(current["id"], str(match["group_id"]))
    is_admin = role in (ROLE_OWNER, ROLE_ORGANIZER)
    if not is_admin:
        if payload.guest_id or (payload.user_id != current["id"]):
            raise HTTPException(status_code=403, detail="Можеш да задаваш голове само за себе си")

    team = _player_team(match, payload.user_id, payload.guest_id)
    if not team:
        raise HTTPException(status_code=400, detail="Играчът не е в отбор. Първо разпредели отборите.")

    score = match.get("score_data") or {}
    blue_score = int(score.get("blue_goals") or 0)
    red_score = int(score.get("red_goals") or 0)

    # build proposed list
    target_key = ("u", str(payload.user_id)) if payload.user_id else ("g", str(payload.guest_id))
    new_results = []
    found = False
    for p in (match.get("player_results") or []):
        k = ("u", str(p.get("user_id"))) if p.get("user_id") else ("g", str(p.get("guest_id")))
        if k == target_key:
            found = True
            new_results.append({**p, "goals": int(payload.goals), "team": team})
        else:
            new_results.append(p)
    if not found:
        new_results.append({
            "user_id": ObjectId(payload.user_id) if payload.user_id else None,
            "guest_id": ObjectId(payload.guest_id) if payload.guest_id else None,
            "goals": int(payload.goals),
            "team": team,
            "is_guest": bool(payload.guest_id),
        })

    blue_sum = sum(int(p.get("goals") or 0) for p in new_results if p.get("team") == "BLUE")
    red_sum = sum(int(p.get("goals") or 0) for p in new_results if p.get("team") == "RED")
    if blue_sum > blue_score:
        raise HTTPException(
            status_code=400,
            detail=f"Сумата на головете на Сините ({blue_sum}) не може да надвиши общия резултат ({blue_score})",
        )
    if red_sum > red_score:
        raise HTTPException(
            status_code=400,
            detail=f"Сумата на головете на Червените ({red_sum}) не може да надвиши общия резултат ({red_score})",
        )

    await db.matches.update_one(
        {"_id": match["_id"]}, {"$set": {"player_results": new_results}}
    )
    return {"updated": True, "blue_individual": blue_sum, "red_individual": red_sum}


@match_router.post("/{match_id}/score")
async def set_score(match_id: str, payload: SetMatchScoreRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    if payload.blue_goals < 0 or payload.red_goals < 0:
        raise HTTPException(status_code=400, detail="Голове >= 0")

    blue_sum = _sum_individual_goals(match, "BLUE")
    red_sum = _sum_individual_goals(match, "RED")
    if blue_sum > payload.blue_goals:
        raise HTTPException(
            status_code=400,
            detail=f"Вече има {blue_sum} индивидуални за Сините. Общият не може да е по-малък.",
        )
    if red_sum > payload.red_goals:
        raise HTTPException(
            status_code=400,
            detail=f"Вече има {red_sum} индивидуални за Червените. Общият не може да е по-малък.",
        )

    await db.matches.update_one(
        {"_id": match["_id"]},
        {"$set": {
            "score_data.blue_goals": int(payload.blue_goals),
            "score_data.red_goals": int(payload.red_goals),
            "score_data.updated_at": utc_now(),
            "score_data.updated_by_user_id": ObjectId(current["id"]),
        }},
    )
    return {"blue_goals": payload.blue_goals, "red_goals": payload.red_goals}


@match_router.get("/{match_id}/score")
async def get_score(match_id: str, current=Depends(get_current_user_impl)):
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    score = match.get("score_data") or {}
    return {
        "blue_goals": int(score.get("blue_goals") or 0),
        "red_goals": int(score.get("red_goals") or 0),
        "updated_at": score["updated_at"].isoformat() if hasattr(score.get("updated_at"), "isoformat") else score.get("updated_at"),
    }


# ---------------------------------------------------------------------------
# ========== TEAMS DRAFT (PRO) ==========
# ---------------------------------------------------------------------------
def _team_member_entry(user_id: Optional[ObjectId], guest_id: Optional[ObjectId]) -> dict:
    return {
        "user_id": user_id,
        "guest_id": guest_id,
        "is_guest": guest_id is not None,
    }


def _entry_key(entry: dict) -> Tuple[str, str]:
    if entry.get("user_id"):
        return ("u", str(entry["user_id"]))
    return ("g", str(entry.get("guest_id")))


async def _resolve_going_players(match: dict) -> list[dict]:
    db = get_db()
    out = []
    async for r in db.rsvps.find({"match_id": match["_id"], "status": "going"}).sort("created_at", 1):
        uid = r.get("user_id")
        gid = r.get("guest_id")
        name = await _resolve_player_name(db, uid, gid)
        out.append({
            "id": str(uid) if uid else str(gid),
            "user_id": str(uid) if uid else None,
            "guest_id": str(gid) if gid else None,
            "name": name,
            "is_guest": bool(r.get("is_guest")),
        })
    return out


async def _team_view(match: dict) -> dict:
    td = match.get("teams_data") or {}
    going = await _resolve_going_players(match)

    # mark captain & team
    blue_entries = td.get("blue_team") or []
    red_entries = td.get("red_team") or []
    blue_keys = {_entry_key(e) for e in blue_entries}
    red_keys = {_entry_key(e) for e in red_entries}

    for p in going:
        key = ("u", p["user_id"]) if p["user_id"] else ("g", p["guest_id"])
        if key in blue_keys:
            p["team"] = "BLUE"
        elif key in red_keys:
            p["team"] = "RED"
        else:
            p["team"] = None
        p["is_captain"] = (
            (td.get("blue_captain_id") and p["user_id"] == str(td["blue_captain_id"]))
            or (td.get("red_captain_id") and p["user_id"] == str(td["red_captain_id"]))
        )

    available = [p for p in going if p["team"] is None]
    blue_players = [p for p in going if p["team"] == "BLUE"]
    red_players = [p for p in going if p["team"] == "RED"]

    pick_order = []
    for po in (td.get("pick_order") or []):
        po2 = dict(po)
        if isinstance(po2.get("user_id"), ObjectId):
            po2["user_id"] = str(po2["user_id"])
        if isinstance(po2.get("guest_id"), ObjectId):
            po2["guest_id"] = str(po2["guest_id"])
        if hasattr(po2.get("picked_at"), "isoformat"):
            po2["picked_at"] = po2["picked_at"].isoformat()
        pick_order.append(po2)

    return {
        "teams_data": {
            "blue_captain_id": str(td["blue_captain_id"]) if td.get("blue_captain_id") else None,
            "red_captain_id": str(td["red_captain_id"]) if td.get("red_captain_id") else None,
            "turn": td.get("turn") or "BLUE",
            "pick_order": pick_order,
            "locked": bool(td.get("locked")),
            "draft_visible": bool(td.get("draft_visible")),
        },
        "going_players": going,
        "available_players": available,
        "blue_players": blue_players,
        "red_players": red_players,
    }


@match_router.get("/{match_id}/teams")
async def get_teams(match_id: str, current=Depends(get_current_user_impl)):
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    return await _team_view(match)


async def _user_is_active_captain(match: dict, user_id: str) -> bool:
    td = match.get("teams_data") or {}
    turn = td.get("turn") or "BLUE"
    cap = td.get("blue_captain_id") if turn == "BLUE" else td.get("red_captain_id")
    return cap is not None and str(cap) == str(user_id)


@match_router.post("/{match_id}/teams/set-captains")
async def set_captains(match_id: str, payload: SetCaptainsRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    if payload.blue_captain_id == payload.red_captain_id:
        raise HTTPException(status_code=400, detail="Капитаните трябва да са различни хора")

    blue_uid = await _oid(payload.blue_captain_id)
    red_uid = await _oid(payload.red_captain_id)

    blue_rsvp = await db.rsvps.find_one({"match_id": match["_id"], "user_id": blue_uid, "status": "going"})
    red_rsvp = await db.rsvps.find_one({"match_id": match["_id"], "user_id": red_uid, "status": "going"})
    if not blue_rsvp or not red_rsvp:
        raise HTTPException(status_code=400, detail="Капитанът трябва да е записан за мача")

    td = match.get("teams_data") or {}
    if td.get("pick_order"):
        raise HTTPException(status_code=400, detail="Първо нулирайте отборите")

    new_td = {
        "blue_captain_id": blue_uid,
        "red_captain_id": red_uid,
        "blue_team": [_team_member_entry(blue_uid, None)],
        "red_team": [_team_member_entry(red_uid, None)],
        "turn": "BLUE",
        "pick_order": [],
        "locked": False,
        "draft_visible": td.get("draft_visible") or False,
    }
    await db.matches.update_one({"_id": match["_id"]}, {"$set": {"teams_data": new_td}})
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/pick")
async def pick_player(match_id: str, payload: PickPlayerRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))

    role = await get_user_role_in_group(current["id"], str(match["group_id"]))
    is_admin = role in (ROLE_OWNER, ROLE_ORGANIZER)
    is_captain = await _user_is_active_captain(match, current["id"])
    if not (is_admin or is_captain):
        raise HTTPException(status_code=403, detail="Само OWNER/ORGANIZER или активният капитан може да пика")

    td = match.get("teams_data") or {}
    if td.get("locked"):
        raise HTTPException(status_code=400, detail="Отборите са заключени")
    if not td.get("blue_captain_id") or not td.get("red_captain_id"):
        raise HTTPException(status_code=400, detail="Първо изберете капитани")

    target_uid = await _oid(payload.user_id)
    rsvp_doc = await db.rsvps.find_one({"match_id": match["_id"], "user_id": target_uid, "status": "going"})
    if not rsvp_doc:
        raise HTTPException(status_code=400, detail="Играчът не е записан")

    # other captain check
    turn = td.get("turn") or "BLUE"
    other_captain = td.get("red_captain_id") if turn == "BLUE" else td.get("blue_captain_id")
    if other_captain and str(target_uid) == str(other_captain):
        raise HTTPException(status_code=400, detail="Не може да пикнеш капитана на другия отбор")

    # already in a team?
    target_key = ("u", str(target_uid))
    for entry in (td.get("blue_team") or []) + (td.get("red_team") or []):
        if _entry_key(entry) == target_key:
            raise HTTPException(status_code=400, detail="Вече е в отбор")

    new_pick = {
        "user_id": target_uid,
        "guest_id": None,
        "team": turn,
        "picked_at": utc_now(),
    }
    field = "teams_data.blue_team" if turn == "BLUE" else "teams_data.red_team"
    next_turn = "RED" if turn == "BLUE" else "BLUE"
    await db.matches.update_one(
        {"_id": match["_id"]},
        {
            "$push": {field: _team_member_entry(target_uid, None), "teams_data.pick_order": new_pick},
            "$set": {"teams_data.turn": next_turn},
        },
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/undo-pick")
async def undo_pick(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    td = match.get("teams_data") or {}
    if td.get("locked"):
        raise HTTPException(status_code=400, detail="Отборите са заключени")
    pick_order = td.get("pick_order") or []
    if not pick_order:
        raise HTTPException(status_code=400, detail="Няма пикове за отмяна")

    last = pick_order[-1]
    field = "teams_data.blue_team" if last.get("team") == "BLUE" else "teams_data.red_team"
    pull_filter = {"user_id": last.get("user_id")} if last.get("user_id") else {"guest_id": last.get("guest_id")}
    new_turn = last.get("team") or "BLUE"
    await db.matches.update_one(
        {"_id": match["_id"]},
        {
            "$pull": {field: pull_filter, "teams_data.pick_order": {"picked_at": last.get("picked_at")}},
            "$set": {"teams_data.turn": new_turn},
        },
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/return-player")
async def return_player(match_id: str, payload: ReturnPlayerRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    td = match.get("teams_data") or {}
    if td.get("locked"):
        raise HTTPException(status_code=400, detail="Отборите са заключени")

    target_uid = await _oid(payload.user_id)
    if td.get("blue_captain_id") and str(td["blue_captain_id"]) == str(target_uid):
        raise HTTPException(status_code=400, detail="Капитан не може да се върне. Нулирайте отборите.")
    if td.get("red_captain_id") and str(td["red_captain_id"]) == str(target_uid):
        raise HTTPException(status_code=400, detail="Капитан не може да се върне. Нулирайте отборите.")

    await db.matches.update_one(
        {"_id": match["_id"]},
        {
            "$pull": {
                "teams_data.blue_team": {"user_id": target_uid},
                "teams_data.red_team": {"user_id": target_uid},
                "teams_data.pick_order": {"user_id": target_uid},
            }
        },
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/transfer")
async def transfer_player(match_id: str, payload: TransferPlayerRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))

    td = match.get("teams_data") or {}
    if td.get("locked"):
        raise HTTPException(status_code=400, detail="Отборите са заключени")

    if payload.from_team not in ("BLUE", "RED") or payload.to_team not in ("BLUE", "RED"):
        raise HTTPException(status_code=400, detail="Невалиден отбор")
    if payload.from_team == payload.to_team:
        raise HTTPException(status_code=400, detail="from_team и to_team трябва да са различни")

    target_uid = await _oid(payload.user_id)
    if td.get("blue_captain_id") and str(td["blue_captain_id"]) == str(target_uid):
        raise HTTPException(status_code=400, detail="Капитан не може да се прехвърля")
    if td.get("red_captain_id") and str(td["red_captain_id"]) == str(target_uid):
        raise HTTPException(status_code=400, detail="Капитан не може да се прехвърля")

    src_field = "teams_data.blue_team" if payload.from_team == "BLUE" else "teams_data.red_team"
    dst_field = "teams_data.blue_team" if payload.to_team == "BLUE" else "teams_data.red_team"

    await db.matches.update_one(
        {"_id": match["_id"]},
        {"$pull": {src_field: {"user_id": target_uid}}},
    )
    await db.matches.update_one(
        {"_id": match["_id"]},
        {"$push": {dst_field: _team_member_entry(target_uid, None)}},
    )
    # update pick_order team
    await db.matches.update_one(
        {"_id": match["_id"], "teams_data.pick_order.user_id": target_uid},
        {"$set": {"teams_data.pick_order.$.team": payload.to_team}},
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/lock")
async def lock_teams(match_id: str, payload: LockTeamsRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))
    await db.matches.update_one(
        {"_id": match["_id"]}, {"$set": {"teams_data.locked": bool(payload.locked)}}
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/reset")
async def reset_teams(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))
    if match.get("status") == "COMPLETED":
        raise HTTPException(status_code=400, detail="Не може да нулираш след приключване")

    await db.matches.update_one(
        {"_id": match["_id"]},
        {"$set": {
            "teams_data": {
                "blue_captain_id": None,
                "red_captain_id": None,
                "blue_team": [],
                "red_team": [],
                "turn": "BLUE",
                "pick_order": [],
                "locked": False,
                "draft_visible": (match.get("teams_data") or {}).get("draft_visible") or False,
            },
            "player_results": [],
        }},
    )
    refreshed = await db.matches.find_one({"_id": match["_id"]})
    return await _team_view(refreshed)


@match_router.post("/{match_id}/teams/set-visibility")
async def set_visibility(match_id: str, payload: SetDraftVisibilityRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await check_pro_access(str(match["group_id"]))
    await require_admin(current["id"], str(match["group_id"]))
    await db.matches.update_one(
        {"_id": match["_id"]}, {"$set": {"teams_data.draft_visible": bool(payload.draft_visible)}}
    )
    return {"draft_visible": bool(payload.draft_visible)}


# ---------------------------------------------------------------------------
# ========== RECURRENCE ==========
# ---------------------------------------------------------------------------
async def _create_next_recurrence(series_id: str) -> Optional[dict]:
    """Create the next weekly occurrence if needed, returns the new match doc or None."""
    db = get_db()
    last = await db.matches.find_one(
        {"recurrence_series_id": series_id, "recurrence_active": True},
        sort=[("start_datetime", -1)],
    )
    if not last:
        return None
    last_dt = _ensure_aware(last.get("start_datetime"))
    if not last_dt:
        return None
    next_dt = last_dt + timedelta(days=7)
    if (next_dt - utc_now()).days > 14:
        return None  # too far in the future, wait
    # dedup: any match in the same series within 1h window of next_dt?
    window_start = next_dt - timedelta(hours=1)
    window_end = next_dt + timedelta(hours=1)
    existing = await db.matches.find_one({
        "recurrence_series_id": series_id,
        "start_datetime": {"$gte": window_start, "$lte": window_end},
    })
    if existing:
        return None

    group = await db.groups.find_one({"_id": last["group_id"]})
    new_doc = {
        "group_id": last["group_id"],
        "name": last.get("name"),
        "venue": last.get("venue"),
        "location_link": last.get("location_link"),
        "start_datetime": next_dt,
        "player_limit": last.get("player_limit"),
        "status": "UPCOMING",
        "cancel_reason": None,
        "cancelled_at": None,
        "cancelled_by_user_id": None,
        "pricing_mode": last.get("pricing_mode"),
        "total_cost": last.get("total_cost") or 0,
        "price_per_player": last.get("planned_price_per_player") or 0,
        "planned_price_per_player": last.get("planned_price_per_player") or 0,
        "join_mode": last.get("join_mode") or "AUTO",
        "recurrence": "WEEKLY",
        "recurrence_series_id": series_id,
        "recurrence_active": True,
        "recurrence_source_id": last.get("_id"),
        "season_id": (group or {}).get("active_season_id"),
        "teams_data": {
            "blue_captain_id": None, "red_captain_id": None,
            "blue_team": [], "red_team": [], "turn": "BLUE",
            "pick_order": [], "locked": False, "draft_visible": False,
        },
        "score_data": {"blue_goals": 0, "red_goals": 0, "updated_at": None, "updated_by_user_id": None},
        "player_results": [],
        "player_payments": [],
        "guest_count": 0,
        "cash_contribution": 0.0,
        "created_at": utc_now(),
        "created_by_user_id": last.get("created_by_user_id"),
    }
    res = await db.matches.insert_one(new_doc)
    return await db.matches.find_one({"_id": res.inserted_id})


async def _process_all_recurrences() -> list[dict]:
    db = get_db()
    series_ids = await db.matches.distinct(
        "recurrence_series_id", {"recurrence": "WEEKLY", "recurrence_active": True}
    )
    created = []
    for sid in series_ids:
        if not sid:
            continue
        nm = await _create_next_recurrence(sid)
        if nm:
            created.append({"id": str(nm["_id"]), "name": nm.get("name"),
                            "start_datetime": nm["start_datetime"].isoformat()})
    return created


async def recurrence_background_loop():
    """Hourly loop that creates next weekly matches."""
    while True:
        try:
            await asyncio.sleep(3600)
            created = await _process_all_recurrences()
            if created:
                logger.info("Recurrence: created %d new matches", len(created))
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.exception("Recurrence loop error: %s", exc)
            await asyncio.sleep(60)


@scheduler_router.post("/process-recurrence")
async def trigger_recurrence(current=Depends(get_current_user_impl)):
    created = await _process_all_recurrences()
    return {"created": created, "count": len(created)}


@match_router.post("/{match_id}/stop-recurrence")
async def stop_recurrence(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    await require_admin(current["id"], str(match["group_id"]))
    sid = match.get("recurrence_series_id")
    if not sid:
        raise HTTPException(status_code=400, detail="Мачът не е част от серия")
    await db.matches.update_many(
        {"recurrence_series_id": sid},
        {"$set": {"recurrence_active": False}},
    )
    return {"stopped": True, "series_id": sid}


@match_router.get("/{match_id}/series")
async def get_series(match_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    match = await _get_match(match_id)
    sid = match.get("recurrence_series_id")
    if not sid:
        return []
    out = []
    async for m in db.matches.find({"recurrence_series_id": sid}).sort("start_datetime", 1):
        out.append({
            "id": str(m["_id"]),
            "name": m.get("name"),
            "start_datetime": m["start_datetime"].isoformat() if hasattr(m.get("start_datetime"), "isoformat") else m.get("start_datetime"),
            "status": m.get("status"),
            "recurrence_active": bool(m.get("recurrence_active")),
        })
    return out



@match_router.delete("/{match_id}")
async def delete_match(match_id: str, current=Depends(get_current_user_impl)):
    """Hard delete a match. OWNER only. Cascades to its rsvps, chat messages and push log."""
    db = get_db()
    match = await _get_match(match_id)
    await require_owner(current["id"], str(match["group_id"]))
    mid = match["_id"]
    await db.rsvps.delete_many({"match_id": mid})
    try:
        await db.chat_messages.delete_many({"match_id": mid})
    except Exception:
        pass
    try:
        await db.push_log.delete_many({"match_id": mid})
    except Exception:
        pass
    await db.matches.delete_one({"_id": mid})
    return {"deleted": True, "match_id": match_id}
