"""Dev seed data tools. Only when SUPER_TEST_LOGIN_ENABLED=true."""
from __future__ import annotations

import os
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from deps import (
    DEFAULT_CASH_CATEGORIES,
    DEFAULT_POINTS_CONFIG,
    ROLE_OWNER,
    ROLE_MEMBER,
    get_current_user_impl,
    get_db,
    utc_now,
)

router = APIRouter(prefix="/api/dev", tags=["dev"])


def _check_enabled():
    if os.environ.get("SUPER_TEST_LOGIN_ENABLED", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Dev endpoints disabled")


@router.get("/seed-status")
async def seed_status():
    _check_enabled()
    db = get_db()
    users = await db.users.count_documents({})
    groups = await db.groups.count_documents({})
    matches = await db.matches.count_documents({})
    return {"seeded": users >= 10 and groups >= 2, "users": users, "groups": groups, "matches": matches}


@router.post("/reset")
async def reset_all(current=Depends(get_current_user_impl)):
    _check_enabled()
    db = get_db()
    cols = ["users", "groups", "memberships", "matches", "rsvps", "guests",
            "billing", "cash_transactions", "seasons", "messages", "listings",
            "invitations", "group_follows", "payment_transactions", "otp_codes"]
    for c in cols:
        await db[c].delete_many({})
    return {"reset": True, "collections_cleared": cols}


@router.post("/seed-demo-data")
async def seed_demo_data():
    _check_enabled()
    db = get_db()
    # Recreate indexes idempotently so dropDatabase + seed without restart works
    try:
        from server import _create_indexes
        await _create_indexes(db)
    except Exception:
        pass
    now = utc_now()

    # 10 demo users
    bg_names = ["Иван", "Петър", "Георги", "Димитър", "Николай",
                "Александър", "Мартин", "Христо", "Стоян", "Тодор"]
    user_ids = []
    for i, n in enumerate(bg_names, start=1):
        phone = f"+359888100{i:03d}"
        existing = await db.users.find_one({"phone": phone})
        if existing:
            user_ids.append(existing["_id"]); continue
        rel = random.randint(85, 100)
        u = {
            "name": n, "phone": phone,
            "nickname": None, "email": None, "avatar_url": None,
            "expo_push_token": None,
            "push_prefs": {"new_matches": True, "reminders": True, "reminder_hours": 24, "rsvp_changes": False, "chat": True},
            "location": None, "looking_for_game": False,
            "reliability_score": rel,
            "reliability_stats": {"total_rsvp_going": random.randint(5, 30),
                                   "total_attended": random.randint(4, 28),
                                   "late_cancellations": random.randint(0, 2)},
            "created_at": now,
        }
        res = await db.users.insert_one(u)
        user_ids.append(res.inserted_id)

    # super tester
    super_phone = "+359888999999"
    super_user = await db.users.find_one({"phone": super_phone})
    if not super_user:
        res = await db.users.insert_one({
            "name": "Super Tester", "phone": super_phone,
            "nickname": None, "email": None, "avatar_url": None,
            "expo_push_token": None,
            "push_prefs": {"new_matches": True, "reminders": True, "reminder_hours": 24, "rsvp_changes": False, "chat": True},
            "location": None, "looking_for_game": False,
            "reliability_score": 100,
            "reliability_stats": {"total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0},
            "created_at": now,
        })
        super_id = res.inserted_id
    else:
        super_id = super_user["_id"]

    # 2 groups
    async def _ensure_group(name, code, location, owner_id, pro: bool):
        existing = await db.groups.find_one({"entry_code": code})
        if existing:
            return existing["_id"]
        location["point"] = {"type": "Point", "coordinates": [float(location["lng"]), float(location["lat"])]}
        doc = {
            "name": name, "entry_code": code,
            "default_player_limit": 14,
            "location": location, "venue": location.get("name"),
            "active_season_id": None,
            "points_config": DEFAULT_POINTS_CONFIG,
            "cash_categories": list(DEFAULT_CASH_CATEGORIES),
            "currency": "EUR",
            "created_at": now,
            "created_by_user_id": owner_id,
        }
        res = await db.groups.insert_one(doc)
        gid = res.inserted_id
        # owner membership
        await db.memberships.insert_one({"group_id": gid, "user_id": owner_id, "role": ROLE_OWNER, "joined_at": now})
        # billing TRIAL
        await db.billing.insert_one({
            "group_id": gid, "plan": "PRO", "status": "active",
            "is_trial": not pro, "period_start": now,
            "period_end": now + timedelta(days=30 if pro else 14),
            "currency": "EUR", "created_at": now,
        })
        return gid

    free_gid = await _ensure_group("Спортна София", "SPORT26",
                                    {"name": "Редута, София", "lat": 42.68, "lng": 23.35},
                                    super_id, pro=False)
    pro_gid = await _ensure_group("ДИТ Неделя", "DIT2026",
                                   {"name": "Борисова, София", "lat": 42.685, "lng": 23.34},
                                   super_id, pro=True)

    # mark FREE group as actually FREE (delete billing) to honor spec
    await db.billing.delete_many({"group_id": free_gid})

    # add demo users as members
    for uid in user_ids:
        for gid in (free_gid, pro_gid):
            existing = await db.memberships.find_one({"group_id": gid, "user_id": uid})
            if not existing:
                await db.memberships.insert_one({"group_id": gid, "user_id": uid, "role": ROLE_MEMBER, "joined_at": now})

    # 4 matches in pro group
    matches_made = []

    def _empty_teams():
        return {"blue_captain_id": None, "red_captain_id": None, "blue_team": [], "red_team": [],
                "turn": "BLUE", "pick_order": [], "locked": False, "draft_visible": False}

    def _empty_score():
        return {"blue_goals": 0, "red_goals": 0, "updated_at": None, "updated_by_user_id": None}

    async def _create_match(name, days_offset, pricing, total_cost, price_pp, status):
        doc = {
            "group_id": pro_gid, "name": name, "venue": "Борисова",
            "location_link": None,
            "start_datetime": now + timedelta(days=days_offset),
            "player_limit": 14, "status": status,
            "cancel_reason": None, "cancelled_at": None, "cancelled_by_user_id": None,
            "pricing_mode": pricing, "total_cost": total_cost,
            "price_per_player": price_pp, "planned_price_per_player": price_pp,
            "join_mode": "AUTO", "recurrence": "ONE_TIME",
            "recurrence_series_id": None, "recurrence_active": False,
            "recurrence_source_id": None, "season_id": None,
            "teams_data": _empty_teams(), "score_data": _empty_score(),
            "player_results": [], "player_payments": [],
            "guest_count": 0, "cash_contribution": 0.0,
            "created_at": now, "created_by_user_id": super_id,
        }
        res = await db.matches.insert_one(doc)
        return res.inserted_id

    # 2 past completed
    m1 = await _create_match("Минал #1", -7, "SPLIT", 140.0, 10.0, "COMPLETED")
    m2 = await _create_match("Минал #2", -14, "FIXED", 0, 10.0, "COMPLETED")
    # 2 upcoming
    m3 = await _create_match("Идващ #1", 3, "SPLIT_WITH_CASH", 140.0, 10.0, "UPCOMING")
    m4 = await _create_match("Идващ #2", 7, "CASH_PAYS_ALL", 80.0, 0.0, "UPCOMING")
    matches_made = [m1, m2, m3, m4]

    # RSVPs
    for mid in matches_made:
        sample = user_ids[: random.randint(8, 10)]
        for uid in sample:
            existing = await db.rsvps.find_one({"match_id": mid, "user_id": uid})
            if not existing:
                await db.rsvps.insert_one({
                    "match_id": mid, "user_id": uid, "guest_id": None,
                    "is_guest": False, "status": "going", "waitlist_position": None,
                    "added_by": None, "removed_by": None,
                    "created_at": now, "updated_at": now,
                })

    # For past matches: assign teams + score + goals + payments
    for mid in (m1, m2):
        rsvps = [r async for r in db.rsvps.find({"match_id": mid, "status": "going"})]
        team_a = rsvps[: len(rsvps) // 2]
        team_b = rsvps[len(rsvps) // 2:]
        blue_team = [{"user_id": r["user_id"], "guest_id": None, "is_guest": False} for r in team_a]
        red_team = [{"user_id": r["user_id"], "guest_id": None, "is_guest": False} for r in team_b]
        td = _empty_teams()
        td.update({
            "blue_captain_id": team_a[0]["user_id"] if team_a else None,
            "red_captain_id": team_b[0]["user_id"] if team_b else None,
            "blue_team": blue_team, "red_team": red_team, "locked": True,
        })
        bg, rg = (3, 2) if mid == m1 else (1, 1)
        score = {"blue_goals": bg, "red_goals": rg, "updated_at": now,
                 "updated_by_user_id": super_id}
        results = []
        # spread goals
        for i in range(bg):
            entry = team_a[i % len(team_a)]
            results.append({
                "user_id": entry["user_id"], "guest_id": None,
                "goals": 1, "team": "BLUE", "is_guest": False,
            })
        for i in range(rg):
            entry = team_b[i % len(team_b)]
            results.append({
                "user_id": entry["user_id"], "guest_id": None,
                "goals": 1, "team": "RED", "is_guest": False,
            })
        # consolidate goals per user
        consolidated = {}
        for r in results:
            key = str(r["user_id"])
            if key in consolidated:
                consolidated[key]["goals"] += r["goals"]
            else:
                consolidated[key] = r
        results = list(consolidated.values())

        # payments: random PAID/UNPAID
        payments = []
        for r in rsvps:
            paid = random.choice([True, True, False])
            payments.append({
                "user_id": r["user_id"], "guest_id": None, "name": "",
                "amount": 10.0, "paid_amount": 10.0 if paid else 0.0,
                "status": "PAID" if paid else "UNPAID",
                "overpaid_to_cash": 0.0,
                "paid_at": now if paid else None, "marked_by": super_id,
            })

        await db.matches.update_one({"_id": mid},
            {"$set": {"teams_data": td, "score_data": score,
                       "player_results": results, "player_payments": payments}})

    # Cash transactions
    for cat, typ, amt in [
        ("BALLS", "EXPENSE", 35.0),
        ("EQUIPMENT", "EXPENSE", 80.0),
        ("MATCH_FEES", "INCOME", 100.0),
        ("PITCH_PAYMENT", "EXPENSE", 60.0),
        ("MATCH_FEES", "INCOME", 90.0),
    ]:
        existing = await db.cash_transactions.find_one(
            {"group_id": pro_gid, "category": cat, "amount": amt}
        )
        if not existing:
            await db.cash_transactions.insert_one({
                "group_id": pro_gid, "type": typ, "category": cat,
                "amount": amt, "currency": "EUR",
                "note": "Demo seed", "counterparty": None, "status": "PAID",
                "related_match_id": None,
                "created_by_user_id": super_id, "created_at": now, "paid_at": now,
            })

    # Seasons: 1 closed + 1 active
    closed_existing = await db.seasons.find_one({"group_id": pro_gid, "name": "Зима 2025"})
    if not closed_existing:
        closed_id = (await db.seasons.insert_one({
            "group_id": pro_gid, "name": "Зима 2025",
            "start_at": now - timedelta(days=120), "end_at": now - timedelta(days=10),
            "is_active": False, "champions": [
                {"position": 1, "user_id": str(user_ids[0]), "user_name": "Иван",
                 "points": 18, "matches": 6, "goals": 5, "coefficient": 3.0},
                {"position": 2, "user_id": str(user_ids[1]), "user_name": "Петър",
                 "points": 15, "matches": 6, "goals": 4, "coefficient": 2.5},
                {"position": 3, "user_id": str(user_ids[2]), "user_name": "Георги",
                 "points": 12, "matches": 6, "goals": 3, "coefficient": 2.0},
            ],
            "closed_at": now - timedelta(days=10),
            "created_at": now - timedelta(days=120), "created_by_user_id": super_id,
        })).inserted_id
    active_existing = await db.seasons.find_one({"group_id": pro_gid, "name": "Пролет 2026"})
    if not active_existing:
        active_id = (await db.seasons.insert_one({
            "group_id": pro_gid, "name": "Пролет 2026",
            "start_at": now - timedelta(days=5), "end_at": now + timedelta(days=85),
            "is_active": True, "champions": [], "closed_at": None,
            "created_at": now, "created_by_user_id": super_id,
        })).inserted_id
        await db.groups.update_one({"_id": pro_gid}, {"$set": {"active_season_id": active_id}})

    # Listings
    listings_count = await db.listings.count_documents({})
    if listings_count < 2:
        author = await db.users.find_one({"_id": super_id})
        from deps import mask_phone as _mp
        await db.listings.insert_one({
            "type": "LOOKING_FOR_PLAYERS", "title": "Търсим 2 играчи за вторник",
            "description": "Имаме мач, нужни 2 души",
            "venue": "Борисова", "location": {"name": "Борисова, София", "lat": 42.685, "lng": 23.34,
                                                 "point": {"type": "Point", "coordinates": [23.34, 42.685]}},
            "date": (now + timedelta(days=3)).isoformat(),
            "time": "20:00", "spots_needed": 2, "total_players": 14,
            "price_per_player": 10.0, "currency": "EUR",
            "group_id": pro_gid, "match_id": m3,
            "author_id": super_id, "author_name": author.get("name", ""),
            "author_phone_masked": _mp(author.get("phone", "")),
            "author_reliability_score": author.get("reliability_score", 100),
            "responses": [], "status": "ACTIVE",
            "created_at": now, "expires_at": now + timedelta(days=4),
        })
        await db.listings.insert_one({
            "type": "LOOKING_FOR_TEAM", "title": "Отбор търси съперник за петък",
            "description": "Имаме 7 души",
            "venue": "Редута", "location": {"name": "Редута, София", "lat": 42.68, "lng": 23.35,
                                              "point": {"type": "Point", "coordinates": [23.35, 42.68]}},
            "date": (now + timedelta(days=5)).isoformat(),
            "time": "21:00", "total_players": 14,
            "price_per_player": 8.0, "currency": "EUR",
            "group_id": pro_gid, "match_id": None,
            "author_id": super_id, "author_name": author.get("name", ""),
            "author_phone_masked": _mp(author.get("phone", "")),
            "author_reliability_score": 100,
            "responses": [], "status": "ACTIVE",
            "created_at": now, "expires_at": now + timedelta(days=6),
        })

    # 3 chat messages
    msgs_count = await db.messages.count_documents({"group_id": pro_gid})
    if msgs_count < 3:
        for txt, uid in [
            ("Утре играем ли? ⚽🔥", user_ids[0]),
            ("Аз съм. 💪", user_ids[1]),
            ("Трябват ни още 2 човека 🙏", super_id),
        ]:
            uname = (await db.users.find_one({"_id": uid}, {"name": 1})).get("name") or ""
            await db.messages.insert_one({
                "group_id": pro_gid, "match_id": None, "user_id": uid,
                "user_name": uname, "text": txt, "created_at": now,
            })

    return {
        "seeded": True,
        "super_phone": super_phone,
        "free_group_code": "SPORT26",
        "pro_group_code": "DIT2026",
        "users_count": len(user_ids) + 1,
        "matches": [str(m) for m in matches_made],
    }
