"""Seasons CRUD + Hall of Fame on close (PRO)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from deps import (
    SeasonCreateRequest,
    SeasonUpdateRequest,
    DEFAULT_POINTS_CONFIG,
    check_pro_access,
    get_current_user_impl,
    get_db,
    require_admin,
    require_owner,
    utc_now,
)

router = APIRouter(prefix="/api/groups", tags=["seasons"])


def _parse_dt(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Невалидна дата")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _serialize(s: dict) -> dict:
    out = {
        "id": str(s["_id"]),
        "group_id": str(s.get("group_id")),
        "name": s.get("name"),
        "start_at": s["start_at"].isoformat() if hasattr(s.get("start_at"), "isoformat") else s.get("start_at"),
        "end_at": s["end_at"].isoformat() if hasattr(s.get("end_at"), "isoformat") else s.get("end_at"),
        "is_active": bool(s.get("is_active")),
        "champions": s.get("champions") or [],
        "closed_at": s["closed_at"].isoformat() if hasattr(s.get("closed_at"), "isoformat") else s.get("closed_at"),
    }
    return out


@router.get("/{group_id}/seasons")
async def list_seasons(group_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    out = []
    async for s in db.seasons.find({"group_id": gid}).sort("start_at", -1):
        out.append(_serialize(s))
    return out


@router.post("/{group_id}/seasons")
async def create_season(group_id: str, payload: SeasonCreateRequest, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name е задължително")
    start_at = _parse_dt(payload.start_at)
    end_at = _parse_dt(payload.end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at трябва да е след start_at")
    existing = await db.seasons.find_one({"group_id": gid, "name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Сезон с това име вече съществува")
    doc = {
        "group_id": gid,
        "name": name,
        "start_at": start_at,
        "end_at": end_at,
        "is_active": False,
        "champions": [],
        "closed_at": None,
        "created_at": utc_now(),
        "created_by_user_id": ObjectId(current["id"]),
    }
    res = await db.seasons.insert_one(doc)
    saved = await db.seasons.find_one({"_id": res.inserted_id})
    return _serialize(saved)


@router.patch("/{group_id}/seasons/{season_id}")
async def update_season(group_id: str, season_id: str, payload: SeasonUpdateRequest,
                         current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id); sid = ObjectId(season_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    body = payload.model_dump(exclude_unset=True)
    update: dict = {}
    if "name" in body and body["name"] is not None:
        update["name"] = body["name"].strip()
    if "start_at" in body and body["start_at"]:
        update["start_at"] = _parse_dt(body["start_at"])
    if "end_at" in body and body["end_at"]:
        update["end_at"] = _parse_dt(body["end_at"])
    if "start_at" in update and "end_at" in update and update["end_at"] <= update["start_at"]:
        raise HTTPException(status_code=400, detail="end_at трябва да е след start_at")
    if update:
        res = await db.seasons.update_one({"_id": sid, "group_id": gid}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Сезонът не е намерен")
    saved = await db.seasons.find_one({"_id": sid, "group_id": gid})
    return _serialize(saved)


@router.post("/{group_id}/seasons/{season_id}/set-active")
async def set_active(group_id: str, season_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id); sid = ObjectId(season_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    season = await db.seasons.find_one({"_id": sid, "group_id": gid})
    if not season:
        raise HTTPException(status_code=404, detail="Сезонът не е намерен")
    await db.seasons.update_many({"group_id": gid}, {"$set": {"is_active": False}})
    await db.seasons.update_one({"_id": sid}, {"$set": {"is_active": True}})
    await db.groups.update_one({"_id": gid}, {"$set": {"active_season_id": sid}})
    saved = await db.seasons.find_one({"_id": sid})
    return _serialize(saved)


@router.post("/{group_id}/seasons/{season_id}/close")
async def close_season(group_id: str, season_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_owner(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id); sid = ObjectId(season_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    season = await db.seasons.find_one({"_id": sid, "group_id": gid})
    if not season:
        raise HTTPException(status_code=404, detail="Сезонът не е намерен")

    group = await db.groups.find_one({"_id": gid})
    cfg = group.get("points_config") or DEFAULT_POINTS_CONFIG
    win_pts = float(cfg.get("win", 3))
    draw_pts = float(cfg.get("draw", 1))
    loss_pts = float(cfg.get("loss", 0))

    # Compute leaderboard for this season (points metric)
    members = [m["user_id"] async for m in db.memberships.find({"group_id": gid})]
    name_map = {}
    if members:
        async for u in db.users.find({"_id": {"$in": members}}, {"name": 1, "nickname": 1}):
            name_map[u["_id"]] = u.get("nickname") or u.get("name") or ""

    standings = []
    for uid in members:
        matches = wins = draws = losses = goals = 0
        async for m in db.matches.find({"group_id": gid, "status": "COMPLETED", "season_id": sid}):
            rsvp = await db.rsvps.find_one(
                {"match_id": m["_id"], "user_id": uid, "status": "going"}, {"_id": 1}
            )
            if not rsvp:
                continue
            td = m.get("teams_data") or {}
            in_blue = any(str(e.get("user_id")) == str(uid) for e in (td.get("blue_team") or []))
            in_red = any(str(e.get("user_id")) == str(uid) for e in (td.get("red_team") or []))
            score = m.get("score_data") or {}
            bg = int(score.get("blue_goals") or 0)
            rg = int(score.get("red_goals") or 0)
            if in_blue or in_red:
                matches += 1
                my = bg if in_blue else rg
                other = rg if in_blue else bg
                if my > other: wins += 1
                elif my == other: draws += 1
                else: losses += 1
            for p in (m.get("player_results") or []):
                if str(p.get("user_id")) == str(uid):
                    goals += int(p.get("goals") or 0)
        points = wins * win_pts + draws * draw_pts + losses * loss_pts
        coefficient = round(points / matches, 2) if matches else 0.0
        if matches > 0:
            standings.append({
                "user_id": str(uid),
                "user_name": name_map.get(uid, ""),
                "matches": matches,
                "wins": wins,
                "draws": draws,
                "losses": losses,
                "goals": goals,
                "points": points,
                "coefficient": coefficient,
            })
    standings.sort(key=lambda x: (-x["points"], -x["coefficient"], -x["goals"]))

    champions = [
        {
            "position": i,
            "user_id": s["user_id"],
            "user_name": s["user_name"],
            "points": s["points"],
            "matches": s["matches"],
            "goals": s["goals"],
            "coefficient": s["coefficient"],
        }
        for i, s in enumerate(standings[:3], start=1)
    ]

    await db.seasons.update_one(
        {"_id": sid},
        {"$set": {"is_active": False, "closed_at": utc_now(), "champions": champions}},
    )
    if str(group.get("active_season_id")) == str(sid):
        await db.groups.update_one({"_id": gid}, {"$set": {"active_season_id": None}})

    saved = await db.seasons.find_one({"_id": sid})
    return _serialize(saved)


@router.get("/{group_id}/seasons/hall-of-fame")
async def hall_of_fame(group_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    out = []
    async for s in db.seasons.find({"group_id": gid, "closed_at": {"$ne": None}}).sort("end_at", -1):
        if not s.get("champions"):
            continue
        out.append({
            "season": {
                "id": str(s["_id"]),
                "name": s.get("name"),
                "start_at": s["start_at"].isoformat() if hasattr(s.get("start_at"), "isoformat") else s.get("start_at"),
                "end_at": s["end_at"].isoformat() if hasattr(s.get("end_at"), "isoformat") else s.get("end_at"),
            },
            "champions": s["champions"],
        })
    return out


@router.delete("/{group_id}/seasons/{season_id}")
async def delete_season(group_id: str, season_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_owner(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id); sid = ObjectId(season_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    has_matches = await db.matches.count_documents({"group_id": gid, "season_id": sid})
    if has_matches > 0:
        raise HTTPException(status_code=400, detail="Сезонът има мачове")
    res = await db.seasons.delete_one({"_id": sid, "group_id": gid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Сезонът не е намерен")
    return {"deleted": True}
