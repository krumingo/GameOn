"""Stats + Leaderboard. Reads points from group.points_config (NEVER hardcoded)."""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    DEFAULT_POINTS_CONFIG,
    check_pro_access,
    get_current_user_impl,
    get_db,
    utc_now,
)

router = APIRouter(prefix="/api/groups", tags=["stats"])


async def _player_record(group_id: ObjectId, user_id: ObjectId,
                          season_filter: Optional[ObjectId], date_filter: Optional[dict]):
    """Compute a single player's aggregate (matches, wins, draws, losses, goals, points)."""
    db = get_db()
    q: dict = {"group_id": group_id, "status": "COMPLETED"}
    if season_filter:
        q["season_id"] = season_filter
    if date_filter:
        q["start_datetime"] = date_filter

    matches = wins = draws = losses = goals = 0
    async for m in db.matches.find(q):
        # determine if user was going
        rsvp = await db.rsvps.find_one(
            {"match_id": m["_id"], "user_id": user_id, "status": "going"}, {"_id": 1}
        )
        if not rsvp:
            continue
        # find team
        td = m.get("teams_data") or {}
        in_blue = any(str(e.get("user_id")) == str(user_id) for e in (td.get("blue_team") or []))
        in_red = any(str(e.get("user_id")) == str(user_id) for e in (td.get("red_team") or []))
        score = m.get("score_data") or {}
        bg = int(score.get("blue_goals") or 0)
        rg = int(score.get("red_goals") or 0)
        if in_blue or in_red:
            matches += 1
            my_team_score = bg if in_blue else rg
            other_score = rg if in_blue else bg
            if my_team_score > other_score:
                wins += 1
            elif my_team_score == other_score:
                draws += 1
            else:
                losses += 1
        # goals from player_results regardless of team check (for goals metric)
        for p in (m.get("player_results") or []):
            if str(p.get("user_id")) == str(user_id):
                goals += int(p.get("goals") or 0)

    return {"matches": matches, "wins": wins, "draws": draws, "losses": losses, "goals": goals}


@router.get("/{group_id}/stats")
async def group_stats(
    group_id: str,
    season_id: Optional[str] = "all",
    period: Optional[str] = "all",
    current=Depends(get_current_user_impl),
):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    season_filter = None
    if season_id and season_id != "all":
        try:
            season_filter = ObjectId(season_id)
        except Exception:
            season_filter = None
    date_filter = None
    if period == "week":
        date_filter = {"$gte": utc_now() - timedelta(days=7)}
    elif period == "month":
        date_filter = {"$gte": utc_now() - timedelta(days=30)}

    members_count = await db.memberships.count_documents({"group_id": gid})
    total_matches = await db.matches.count_documents({"group_id": gid})
    total_rsvps = await db.rsvps.count_documents({
        "match_id": {"$in": [m["_id"] async for m in db.matches.find({"group_id": gid}, {"_id": 1})]},
        "status": "going",
    }) if total_matches else 0
    avg_per_match = round(total_rsvps / total_matches, 1) if total_matches else 0.0

    cfg = group.get("points_config") or DEFAULT_POINTS_CONFIG
    win_pts = float(cfg.get("win", 3))
    draw_pts = float(cfg.get("draw", 1))
    loss_pts = float(cfg.get("loss", 0))

    # my_stats
    my_uid = ObjectId(current["id"])
    rec = await _player_record(gid, my_uid, season_filter, date_filter)
    user = await db.users.find_one({"_id": my_uid}, {"_id": 0, "reliability_score": 1})
    points = rec["wins"] * win_pts + rec["draws"] * draw_pts + rec["losses"] * loss_pts
    coefficient = round(points / rec["matches"], 2) if rec["matches"] else 0.0

    # attendance rate = matches played / matches in group
    attendance_rate = round((rec["matches"] / total_matches) * 100, 1) if total_matches else 0.0

    my_stats = {
        "matches_played": rec["matches"],
        "goals": rec["goals"],
        "wins": rec["wins"],
        "draws": rec["draws"],
        "losses": rec["losses"],
        "points": points,
        "coefficient": coefficient,
        "attendance_rate": attendance_rate,
        "reliability_score": (user or {}).get("reliability_score", 100),
    }

    # top 3 by goals across all members
    top_players = []
    members = []
    async for m in db.memberships.find({"group_id": gid}):
        members.append(m["user_id"])
    user_records = []
    user_names = {}
    if members:
        async for u in db.users.find({"_id": {"$in": members}}, {"name": 1, "nickname": 1}):
            user_names[u["_id"]] = u.get("nickname") or u.get("name") or ""
    for uid in members:
        r = await _player_record(gid, uid, season_filter, date_filter)
        user_records.append({
            "user_id": str(uid),
            "name": user_names.get(uid, ""),
            **r,
        })
    user_records.sort(key=lambda x: -x["goals"])
    top_players = user_records[:3]

    # recent matches
    recent_matches = []
    async for m in db.matches.find({"group_id": gid, "status": "COMPLETED"}).sort("start_datetime", -1).limit(5):
        score = m.get("score_data") or {}
        recent_matches.append({
            "id": str(m["_id"]),
            "name": m.get("name"),
            "date": m["start_datetime"].isoformat() if hasattr(m.get("start_datetime"), "isoformat") else m.get("start_datetime"),
            "blue_goals": int(score.get("blue_goals") or 0),
            "red_goals": int(score.get("red_goals") or 0),
        })

    return {
        "group": {
            "members_count": members_count,
            "total_matches": total_matches,
            "total_rsvps": total_rsvps,
            "avg_per_match": avg_per_match,
        },
        "my_stats": my_stats,
        "top_players": top_players,
        "recent_matches": recent_matches,
        "points_config": {"win": win_pts, "draw": draw_pts, "loss": loss_pts},
    }


@router.get("/{group_id}/leaderboard")
async def leaderboard(
    group_id: str,
    metric: str = Query("points"),
    season_id: Optional[str] = "all",
    current=Depends(get_current_user_impl),
):
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    group = await db.groups.find_one({"_id": gid})
    cfg = group.get("points_config") or DEFAULT_POINTS_CONFIG
    win_pts = float(cfg.get("win", 3))
    draw_pts = float(cfg.get("draw", 1))
    loss_pts = float(cfg.get("loss", 0))

    season_filter = None
    season_label = "All-time"
    if season_id and season_id != "all":
        try:
            season_filter = ObjectId(season_id)
            sdoc = await db.seasons.find_one({"_id": season_filter, "group_id": gid})
            season_label = sdoc.get("name") if sdoc else "Season"
        except Exception:
            season_filter = None

    # Build records
    members = [m["user_id"] async for m in db.memberships.find({"group_id": gid})]
    name_map = {}
    if members:
        async for u in db.users.find({"_id": {"$in": members}}, {"name": 1, "nickname": 1}):
            name_map[u["_id"]] = u.get("nickname") or u.get("name") or ""

    standings = []
    for uid in members:
        rec = await _player_record(gid, uid, season_filter, None)
        attendance_count = await db.rsvps.count_documents({
            "match_id": {"$in": [m["_id"] async for m in db.matches.find({"group_id": gid}, {"_id": 1})]},
            "user_id": uid,
            "status": "going",
        })
        points = rec["wins"] * win_pts + rec["draws"] * draw_pts + rec["losses"] * loss_pts
        coefficient = round(points / rec["matches"], 2) if rec["matches"] else 0.0
        standings.append({
            "user_id": str(uid),
            "name": name_map.get(uid, ""),
            "matches": rec["matches"],
            "wins": rec["wins"],
            "draws": rec["draws"],
            "losses": rec["losses"],
            "goals": rec["goals"],
            "points": points,
            "coefficient": coefficient,
            "attendance_count": attendance_count,
        })

    # Filtering: points metric excludes players without team/matches=0
    if metric == "points":
        standings = [s for s in standings if s["matches"] > 0]
        standings.sort(key=lambda x: (-x["points"], -x["coefficient"], -x["goals"], -x["matches"]))
    elif metric == "goals":
        standings.sort(key=lambda x: (-x["goals"], -x["matches"]))
    elif metric == "participations":
        standings.sort(key=lambda x: (-x["attendance_count"], -x["matches"]))
    else:
        raise HTTPException(status_code=400, detail="metric трябва да е points|goals|participations")

    for i, s in enumerate(standings[:10], start=1):
        s["position"] = i

    season_obj = {"id": season_id if season_filter else None, "name": season_label}
    return {
        "metric": metric,
        "season": season_obj,
        "standings": standings[:10],
        "points_config": {"win": win_pts, "draw": draw_pts, "loss": loss_pts},
    }
