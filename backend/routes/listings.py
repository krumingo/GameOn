"""Marketplace listings + responses + invitations + group follows + player search."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    ListingCreateRequest,
    ListingRespondRequest,
    InviteRequest,
    InvitationActionRequest,
    ROLE_MEMBER,
    check_pro_access,
    get_current_user_impl,
    get_db,
    get_user_role_in_group,
    mask_phone,
    require_admin,
    utc_now,
)

logger_router_prefix = "/api"

router = APIRouter(prefix="/api/listings", tags=["listings"])
players_router = APIRouter(prefix="/api/players", tags=["listings"])
invitations_router = APIRouter(prefix="/api", tags=["listings"])  # /api/groups/{id}/invite, /api/me/invitations, /api/invitations/{id}/respond
follows_router = APIRouter(prefix="/api", tags=["listings"])  # /api/groups/{id}/follow, /api/me/following

LISTING_TYPES = {"MATCH_AVAILABLE", "LOOKING_FOR_PLAYERS", "LOOKING_FOR_TEAM"}


def _ensure_point(loc):
    if not isinstance(loc, dict):
        return loc
    lat = loc.get("lat"); lng = loc.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        loc["point"] = {"type": "Point", "coordinates": [float(lng), float(lat)]}
    return loc


def _serialize_listing(l: dict, include_responses: bool = False) -> dict:
    out = {
        "id": str(l["_id"]),
        "type": l.get("type"),
        "title": l.get("title"),
        "description": l.get("description"),
        "venue": l.get("venue"),
        "location": l.get("location"),
        "date": l.get("date"),
        "time": l.get("time"),
        "spots_needed": l.get("spots_needed"),
        "total_players": l.get("total_players"),
        "price_per_player": l.get("price_per_player"),
        "currency": l.get("currency", "EUR"),
        "group_id": str(l["group_id"]) if l.get("group_id") else None,
        "match_id": str(l["match_id"]) if l.get("match_id") else None,
        "author_id": str(l.get("author_id")) if l.get("author_id") else None,
        "author_name": l.get("author_name"),
        "author_phone_masked": l.get("author_phone_masked"),
        "author_reliability_score": l.get("author_reliability_score"),
        "responses_count": len(l.get("responses") or []),
        "status": l.get("status"),
        "created_at": l["created_at"].isoformat() if hasattr(l.get("created_at"), "isoformat") else l.get("created_at"),
        "expires_at": l["expires_at"].isoformat() if hasattr(l.get("expires_at"), "isoformat") else l.get("expires_at"),
    }
    if include_responses:
        out["responses"] = [
            {
                "user_id": str(r.get("user_id")) if r.get("user_id") else None,
                "user_name": r.get("user_name"),
                "message": r.get("message"),
                "reliability_score": r.get("reliability_score"),
                "status": r.get("status"),
                "created_at": r["created_at"].isoformat() if hasattr(r.get("created_at"), "isoformat") else r.get("created_at"),
            }
            for r in (l.get("responses") or [])
        ]
    return out


# ---------------------------------------------------------------------------
# LISTINGS
# ---------------------------------------------------------------------------
@router.get("")
async def list_listings(
    type: Optional[str] = None,
    location_lat: Optional[float] = None,
    location_lng: Optional[float] = None,
    radius: Optional[float] = None,  # km
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    db = get_db()
    q: dict = {"status": "ACTIVE"}
    if type:
        if type not in LISTING_TYPES:
            raise HTTPException(status_code=400, detail="Невалиден type")
        q["type"] = type
    if location_lat is not None and location_lng is not None and radius:
        q["location.point"] = {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [location_lng, location_lat]},
                "$maxDistance": radius * 1000,
            }
        }
    if date_from or date_to:
        sub = {}
        if date_from:
            sub["$gte"] = date_from
        if date_to:
            sub["$lte"] = date_to
        q["date"] = sub
    out = []
    async for l in db.listings.find(q).sort("created_at", -1).skip(skip).limit(limit):
        out.append(_serialize_listing(l))
    return out


@router.get("/{listing_id}")
async def get_listing(listing_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    is_author = str(listing.get("author_id")) == str(current["id"])
    return _serialize_listing(listing, include_responses=is_author)


@router.post("")
async def create_listing(payload: ListingCreateRequest, current=Depends(get_current_user_impl)):
    if payload.type not in LISTING_TYPES:
        raise HTTPException(status_code=400, detail="Невалиден type")
    if not (payload.title or "").strip():
        raise HTTPException(status_code=400, detail="title е задължително")

    db = get_db()
    # PRO gating: must be admin of a PRO/TRIAL/GRACE group
    if payload.group_id:
        await check_pro_access(payload.group_id)
        await require_admin(current["id"], payload.group_id)
    else:
        # If no group, require user to be OWNER/ORGANIZER of at least one PRO group
        my_admin_groups = []
        async for m in db.memberships.find({"user_id": ObjectId(current["id"]), "role": {"$in": ["OWNER", "ORGANIZER"]}}):
            my_admin_groups.append(m["group_id"])
        if not my_admin_groups:
            raise HTTPException(status_code=403, detail="Нужни са OWNER/ORGANIZER права в PRO група")
        # find at least one PRO group
        from deps import get_group_plan
        ok = False
        for gid in my_admin_groups:
            plan = await get_group_plan(str(gid))
            if plan in ("PRO", "TRIAL", "GRACE"):
                ok = True
                break
        if not ok:
            raise HTTPException(status_code=403, detail={"code": "PLAN_PRO_REQUIRED", "message": "Тази функция изисква PRO план"})

    user = await db.users.find_one({"_id": ObjectId(current["id"])})
    location = _ensure_point(payload.location) if payload.location else None
    now = utc_now()
    expires_at = None
    if payload.date:
        try:
            d = datetime.fromisoformat(payload.date.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            expires_at = d + timedelta(days=1)
        except Exception:
            expires_at = now + timedelta(days=7)
    else:
        expires_at = now + timedelta(days=7)

    doc = {
        "type": payload.type,
        "title": payload.title.strip(),
        "description": payload.description,
        "venue": payload.venue,
        "location": location,
        "date": payload.date,
        "time": payload.time,
        "spots_needed": payload.spots_needed,
        "total_players": payload.total_players,
        "price_per_player": float(payload.price_per_player) if payload.price_per_player is not None else None,
        "currency": "EUR",
        "group_id": ObjectId(payload.group_id) if payload.group_id else None,
        "match_id": ObjectId(payload.match_id) if payload.match_id else None,
        "author_id": ObjectId(current["id"]),
        "author_name": user.get("name", ""),
        "author_phone_masked": mask_phone(user.get("phone", "")),
        "author_reliability_score": user.get("reliability_score", 100),
        "responses": [],
        "status": "ACTIVE",
        "created_at": now,
        "expires_at": expires_at,
    }
    res = await db.listings.insert_one(doc)
    saved = await db.listings.find_one({"_id": res.inserted_id})
    return _serialize_listing(saved, include_responses=True)


@router.post("/{listing_id}/respond")
async def respond_listing(listing_id: str, payload: ListingRespondRequest,
                           current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="Обявата не е активна")
    if str(listing.get("author_id")) == str(current["id"]):
        raise HTTPException(status_code=400, detail="Не може да отговаряш на своя обява")

    user = await db.users.find_one({"_id": ObjectId(current["id"])})
    # Prevent duplicate response by same user
    for r in (listing.get("responses") or []):
        if str(r.get("user_id")) == str(current["id"]):
            raise HTTPException(status_code=400, detail="Вече си отговорил на тази обява")

    response = {
        "user_id": ObjectId(current["id"]),
        "user_name": user.get("name", ""),
        "message": payload.message,
        "reliability_score": user.get("reliability_score", 100),
        "status": "PENDING",
        "created_at": utc_now(),
    }
    await db.listings.update_one({"_id": lid}, {"$push": {"responses": response}})
    return {"success": True}


@router.post("/{listing_id}/respond/{response_user_id}/accept")
async def accept_response(listing_id: str, response_user_id: str,
                           current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
        ruid = ObjectId(response_user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(listing.get("author_id")) != str(current["id"]):
        raise HTTPException(status_code=403, detail="Само авторът може да приема")

    res = await db.listings.update_one(
        {"_id": lid, "responses.user_id": ruid},
        {"$set": {"responses.$.status": "ACCEPTED"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Отговорът не е намерен")

    # If MATCH_AVAILABLE → auto-RSVP for the match
    if listing.get("type") == "MATCH_AVAILABLE" and listing.get("match_id"):
        match = await db.matches.find_one({"_id": listing["match_id"]})
        if match:
            existing = await db.rsvps.find_one({"match_id": match["_id"], "user_id": ruid})
            if existing:
                await db.rsvps.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"status": "going", "updated_at": utc_now()}},
                )
            else:
                await db.rsvps.insert_one({
                    "match_id": match["_id"],
                    "user_id": ruid,
                    "guest_id": None,
                    "is_guest": False,
                    "status": "going",
                    "waitlist_position": None,
                    "added_by": ObjectId(current["id"]),
                    "removed_by": None,
                    "created_at": utc_now(),
                    "updated_at": utc_now(),
                })

    return {"accepted": True}


@router.post("/{listing_id}/respond/{response_user_id}/reject")
async def reject_response(listing_id: str, response_user_id: str,
                           current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
        ruid = ObjectId(response_user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(listing.get("author_id")) != str(current["id"]):
        raise HTTPException(status_code=403, detail="Само авторът може да отхвърля")
    res = await db.listings.update_one(
        {"_id": lid, "responses.user_id": ruid},
        {"$set": {"responses.$.status": "REJECTED"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Отговорът не е намерен")
    return {"rejected": True}


@router.patch("/{listing_id}/close")
async def close_listing(listing_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(listing.get("author_id")) != str(current["id"]):
        raise HTTPException(status_code=403, detail="Само авторът може да затваря")
    await db.listings.update_one({"_id": lid}, {"$set": {"status": "CLOSED"}})
    return {"closed": True}


@router.delete("/{listing_id}")
async def delete_listing(listing_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        lid = ObjectId(listing_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing = await db.listings.find_one({"_id": lid})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(listing.get("author_id")) != str(current["id"]):
        raise HTTPException(status_code=403, detail="Само авторът може да трие")
    await db.listings.delete_one({"_id": lid})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# PLAYERS SEARCH (PRO)
# ---------------------------------------------------------------------------
@players_router.get("/search")
async def search_players(
    q: str = Query("", description="search query"),
    exclude_group: Optional[str] = None,
    current=Depends(get_current_user_impl),
):
    db = get_db()
    # Require user to be admin of at least one PRO group
    from deps import get_group_plan
    found = False
    async for m in db.memberships.find({"user_id": ObjectId(current["id"]), "role": {"$in": ["OWNER", "ORGANIZER"]}}):
        plan = await get_group_plan(str(m["group_id"]))
        if plan in ("PRO", "TRIAL", "GRACE"):
            found = True
            break
    if not found:
        raise HTTPException(status_code=403, detail={"code": "PLAN_PRO_REQUIRED",
                                                       "message": "Тази функция изисква PRO план"})

    qstr = (q or "").strip()
    if len(qstr) < 1:
        return []

    cond = []
    # name match (case-insensitive)
    cond.append({"name": {"$regex": qstr, "$options": "i"}})
    # phone last 4 digits
    if qstr.isdigit() and len(qstr) <= 4:
        cond.append({"phone": {"$regex": f"{qstr}$"}})

    exclude_user_ids = set()
    if exclude_group:
        try:
            egid = ObjectId(exclude_group)
            async for mb in db.memberships.find({"group_id": egid}):
                exclude_user_ids.add(str(mb["user_id"]))
        except Exception:
            pass

    out = []
    async for u in db.users.find({"$or": cond}).limit(50):
        if str(u["_id"]) in exclude_user_ids:
            continue
        groups_count = await db.memberships.count_documents({"user_id": u["_id"]})
        out.append({
            "id": str(u["_id"]),
            "name": u.get("name", ""),
            "phone_masked": mask_phone(u.get("phone", "")),
            "groups_count": groups_count,
            "reliability_score": u.get("reliability_score", 100),
        })
        if len(out) >= 20:
            break
    return out


# ---------------------------------------------------------------------------
# INVITATIONS (PRO)
# ---------------------------------------------------------------------------
@invitations_router.post("/groups/{group_id}/invite")
async def invite_user(group_id: str, payload: InviteRequest,
                       current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        target_uid = ObjectId(payload.user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")

    # already member?
    existing = await db.memberships.find_one({"group_id": gid, "user_id": target_uid})
    if existing:
        raise HTTPException(status_code=400, detail="Вече е член")

    # pending invitation?
    pending = await db.invitations.find_one({
        "group_id": gid, "to_user_id": target_uid, "status": "PENDING"
    })
    if pending:
        raise HTTPException(status_code=400, detail="Вече има pending покана")

    group = await db.groups.find_one({"_id": gid})
    user = await db.users.find_one({"_id": ObjectId(current["id"])})
    target = await db.users.find_one({"_id": target_uid})
    if not target:
        raise HTTPException(status_code=404, detail="Потребителят не е намерен")

    doc = {
        "group_id": gid,
        "group_name": (group or {}).get("name"),
        "from_user_id": ObjectId(current["id"]),
        "from_user_name": user.get("name") if user else "",
        "to_user_id": target_uid,
        "to_user_name": target.get("name", ""),
        "message": payload.message,
        "status": "PENDING",
        "created_at": utc_now(),
    }
    res = await db.invitations.insert_one(doc)
    return {"id": str(res.inserted_id), "status": "PENDING"}


@invitations_router.get("/me/invitations")
async def my_invitations(status: str = "PENDING", current=Depends(get_current_user_impl)):
    db = get_db()
    uid = ObjectId(current["id"])
    out = []
    async for i in db.invitations.find({"to_user_id": uid, "status": status}).sort("created_at", -1):
        out.append({
            "id": str(i["_id"]),
            "group_id": str(i.get("group_id")) if i.get("group_id") else None,
            "group_name": i.get("group_name"),
            "from_user_name": i.get("from_user_name"),
            "message": i.get("message"),
            "status": i.get("status"),
            "created_at": i["created_at"].isoformat() if hasattr(i.get("created_at"), "isoformat") else i.get("created_at"),
        })
    return out


@invitations_router.post("/invitations/{invitation_id}/respond")
async def respond_invitation(invitation_id: str, payload: InvitationActionRequest,
                              current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        iid = ObjectId(invitation_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    inv = await db.invitations.find_one({"_id": iid})
    if not inv:
        raise HTTPException(status_code=404, detail="Поканата не е намерена")
    if str(inv.get("to_user_id")) != str(current["id"]):
        raise HTTPException(status_code=403, detail="Не е твоя покана")
    if inv.get("status") != "PENDING":
        raise HTTPException(status_code=400, detail="Поканата вече е обработена")

    if payload.action == "accept":
        # create membership
        existing = await db.memberships.find_one({"group_id": inv["group_id"], "user_id": ObjectId(current["id"])})
        if not existing:
            await db.memberships.insert_one({
                "group_id": inv["group_id"],
                "user_id": ObjectId(current["id"]),
                "role": ROLE_MEMBER,
                "joined_at": utc_now(),
            })
        await db.invitations.update_one({"_id": iid}, {"$set": {"status": "ACCEPTED"}})
        return {"status": "ACCEPTED"}
    elif payload.action == "decline":
        await db.invitations.update_one({"_id": iid}, {"$set": {"status": "DECLINED"}})
        return {"status": "DECLINED"}
    else:
        raise HTTPException(status_code=400, detail="action трябва да е accept или decline")


# ---------------------------------------------------------------------------
# GROUP FOLLOWS (FREE)
# ---------------------------------------------------------------------------
@follows_router.post("/groups/{group_id}/follow")
async def follow_group(group_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    g = await db.groups.find_one({"_id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    uid = ObjectId(current["id"])
    existing = await db.group_follows.find_one({"user_id": uid, "group_id": gid})
    if existing:
        return {"following": True}
    await db.group_follows.insert_one({
        "user_id": uid, "group_id": gid, "created_at": utc_now(),
    })
    return {"following": True}


@follows_router.delete("/groups/{group_id}/follow")
async def unfollow_group(group_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.group_follows.delete_one({"user_id": ObjectId(current["id"]), "group_id": gid})
    return {"following": False}


@follows_router.get("/me/following")
async def my_following(current=Depends(get_current_user_impl)):
    db = get_db()
    uid = ObjectId(current["id"])
    out = []
    async for f in db.group_follows.find({"user_id": uid}):
        g = await db.groups.find_one({"_id": f["group_id"]})
        if not g:
            continue
        nxt = await db.matches.find_one(
            {"group_id": g["_id"], "start_datetime": {"$gte": utc_now()}, "status": {"$ne": "CANCELLED"}},
            sort=[("start_datetime", 1)],
        )
        out.append({
            "group_id": str(g["_id"]),
            "group_name": g.get("name"),
            "location": g.get("location"),
            "next_match_date": nxt["start_datetime"].isoformat() if nxt and hasattr(nxt.get("start_datetime"), "isoformat") else (nxt.get("start_datetime") if nxt else None),
        })
    return out
