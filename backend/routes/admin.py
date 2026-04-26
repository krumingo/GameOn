"""Admin panel API. Hardcoded credentials for MVP."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Query

from deps import (
    AdminLoginRequest,
    get_db,
    get_group_plan,
    serialize_doc,
    utc_now,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_JWT_ALG = "HS256"


def _admin_secret() -> str:
    return os.environ.get("JWT_SECRET", "dev")


def _create_admin_token() -> str:
    payload = {
        "is_admin": True,
        "iat": int(utc_now().timestamp()),
        "exp": int((utc_now() + timedelta(hours=12)).timestamp()),
    }
    return jwt.encode(payload, _admin_secret(), algorithm=ADMIN_JWT_ALG)


async def admin_required(request: Request) -> dict:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, _admin_secret(), algorithms=[ADMIN_JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Not admin")
    return payload


@router.post("/login")
async def admin_login(payload: AdminLoginRequest):
    expected_email = os.environ.get("ADMIN_EMAIL", "admin@gameon.bg")
    expected_pw = os.environ.get("ADMIN_PASSWORD", "admin_secure_password_2026!")
    if payload.email != expected_email or payload.password != expected_pw:
        raise HTTPException(status_code=401, detail="Невалидни данни")
    return {"admin_token": _create_admin_token()}


@router.get("/stats")
async def admin_stats(_=Depends(admin_required)):
    db = get_db()
    total_users = await db.users.count_documents({})
    total_groups = await db.groups.count_documents({})
    total_matches = await db.matches.count_documents({})
    now = utc_now()
    active_matches = await db.matches.count_documents({"status": "UPCOMING", "start_datetime": {"$gte": now}})
    pro = trial = free = 0
    revenue = 0.0
    async for g in db.groups.find({}, {"_id": 1}):
        plan = await get_group_plan(str(g["_id"]))
        if plan == "PRO":
            pro += 1
        elif plan == "TRIAL":
            trial += 1
        else:
            free += 1
    async for t in db.payment_transactions.find({"payment_status": "paid"}, {"amount": 1, "currency": 1}):
        if (t.get("currency") or "").upper() == "EUR":
            revenue += float(t.get("amount") or 0)

    week_ago = now - timedelta(days=7)
    signups_last_7 = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    matches_last_7 = await db.matches.count_documents({"created_at": {"$gte": week_ago}})

    return {
        "total_users": total_users,
        "total_groups": total_groups,
        "total_matches": total_matches,
        "active_matches": active_matches,
        "pro_groups": pro,
        "free_groups": free,
        "trial_groups": trial,
        "total_revenue_eur": round(revenue, 2),
        "signups_last_7_days": signups_last_7,
        "matches_last_7_days": matches_last_7,
        "currency": "EUR",
    }


@router.get("/groups")
async def admin_groups(
    search: Optional[str] = None,
    plan: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    _=Depends(admin_required),
):
    db = get_db()
    q: dict = {}
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    out = []
    async for g in db.groups.find(q).sort("created_at", -1).skip(skip).limit(limit):
        gp = await get_group_plan(str(g["_id"]))
        if plan and gp != plan:
            continue
        members_count = await db.memberships.count_documents({"group_id": g["_id"]})
        out.append({
            "id": str(g["_id"]),
            "name": g.get("name"),
            "entry_code": g.get("entry_code"),
            "members_count": members_count,
            "plan": gp,
            "created_at": g["created_at"].isoformat() if hasattr(g.get("created_at"), "isoformat") else g.get("created_at"),
        })
    return out


@router.get("/groups/{group_id}")
async def admin_group_detail(group_id: str, _=Depends(admin_required)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    g = await db.groups.find_one({"_id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    members = []
    async for mb in db.memberships.find({"group_id": gid}):
        u = await db.users.find_one({"_id": mb["user_id"]}, {"name": 1, "phone": 1})
        if u:
            members.append({"user_id": str(u["_id"]), "name": u.get("name"), "role": mb.get("role")})
    matches_count = await db.matches.count_documents({"group_id": gid})
    plan = await get_group_plan(group_id)

    txns = await db.cash_transactions.count_documents({"group_id": gid})
    return {
        "id": str(g["_id"]),
        "name": g.get("name"),
        "entry_code": g.get("entry_code"),
        "plan": plan,
        "members": members,
        "matches_count": matches_count,
        "cash_transactions_count": txns,
        "currency": g.get("currency", "EUR"),
        "created_at": g["created_at"].isoformat() if hasattr(g.get("created_at"), "isoformat") else g.get("created_at"),
    }


@router.get("/users")
async def admin_users(search: Optional[str] = None, skip: int = 0, limit: int = 50,
                      _=Depends(admin_required)):
    db = get_db()
    q: dict = {}
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    out = []
    async for u in db.users.find(q).sort("created_at", -1).skip(skip).limit(limit):
        groups_count = await db.memberships.count_documents({"user_id": u["_id"]})
        out.append({
            "id": str(u["_id"]),
            "name": u.get("name"),
            "phone": u.get("phone"),
            "reliability_score": u.get("reliability_score", 100),
            "groups_count": groups_count,
            "created_at": u["created_at"].isoformat() if hasattr(u.get("created_at"), "isoformat") else u.get("created_at"),
        })
    return out


@router.get("/users/{user_id}")
async def admin_user_detail(user_id: str, _=Depends(admin_required)):
    db = get_db()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    u = await db.users.find_one({"_id": uid})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    groups = []
    async for mb in db.memberships.find({"user_id": uid}):
        g = await db.groups.find_one({"_id": mb["group_id"]}, {"name": 1})
        if g:
            groups.append({"group_id": str(g["_id"]), "name": g.get("name"), "role": mb.get("role")})
    return {
        "id": str(u["_id"]),
        "name": u.get("name"),
        "phone": u.get("phone"),
        "reliability_score": u.get("reliability_score", 100),
        "reliability_stats": u.get("reliability_stats", {}),
        "groups": groups,
        "created_at": u["created_at"].isoformat() if hasattr(u.get("created_at"), "isoformat") else u.get("created_at"),
    }


@router.get("/payments")
async def admin_payments(status: Optional[str] = None, skip: int = 0, limit: int = 50,
                          _=Depends(admin_required)):
    db = get_db()
    q: dict = {}
    if status:
        q["payment_status"] = status
    out = []
    async for t in db.payment_transactions.find(q).sort("created_at", -1).skip(skip).limit(limit):
        out.append({
            "id": str(t["_id"]),
            "session_id": t.get("session_id"),
            "group_id": str(t.get("group_id")) if t.get("group_id") else None,
            "user_id": str(t.get("user_id")) if t.get("user_id") else None,
            "amount": float(t.get("amount") or 0),
            "currency": t.get("currency", "EUR"),
            "payment_status": t.get("payment_status"),
            "status": t.get("status"),
            "created_at": t["created_at"].isoformat() if hasattr(t.get("created_at"), "isoformat") else t.get("created_at"),
        })
    return out
