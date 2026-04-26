"""Shared membership queries used by multiple routers."""
from __future__ import annotations

from typing import Optional
from bson import ObjectId

from deps import get_db, ROLE_OWNER, ROLE_ORGANIZER, ROLE_MEMBER, mask_phone, utc_now


_ROLE_ORDER = {ROLE_OWNER: 0, ROLE_ORGANIZER: 1, ROLE_MEMBER: 2}


async def list_members_with_users(group_id: str, include_guests: bool = False) -> list[dict]:
    """Return ordered list of members joined with user data.
    Output shape: { id, user_id, name, phone_masked, role, joined_at, reliability_score, is_guest }
    """
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        return []

    memberships = await db.memberships.find({"group_id": gid}).to_list(length=2000)
    user_ids = [m["user_id"] for m in memberships]
    users_map = {}
    if user_ids:
        async for u in db.users.find({"_id": {"$in": user_ids}}):
            users_map[u["_id"]] = u

    out: list[dict] = []
    for m in memberships:
        u = users_map.get(m["user_id"]) or {}
        out.append({
            "id": str(m["_id"]),
            "user_id": str(m["user_id"]),
            "name": u.get("name", ""),
            "phone_masked": mask_phone(u.get("phone", "")),
            "role": m.get("role", ROLE_MEMBER),
            "joined_at": (m.get("joined_at").isoformat() if hasattr(m.get("joined_at"), "isoformat") else m.get("joined_at")),
            "reliability_score": u.get("reliability_score", 100),
            "is_guest": False,
        })

    if include_guests:
        async for g in db.guests.find({"group_id": gid}):
            out.append({
                "id": str(g["_id"]),
                "user_id": None,
                "name": g.get("name", ""),
                "phone_masked": mask_phone(g.get("phone", "")) if g.get("phone") else "",
                "role": ROLE_MEMBER,
                "joined_at": (g.get("created_at").isoformat() if hasattr(g.get("created_at"), "isoformat") else g.get("created_at")),
                "reliability_score": None,
                "is_guest": True,
            })

    out.sort(key=lambda x: (_ROLE_ORDER.get(x["role"], 9), x.get("joined_at") or ""))
    return out


async def count_members(group_id: str) -> int:
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        return 0
    return await db.memberships.count_documents({"group_id": gid})


async def count_owner_groups(user_id: str) -> int:
    db = get_db()
    try:
        uid = ObjectId(user_id)
    except Exception:
        return 0
    return await db.memberships.count_documents({"user_id": uid, "role": ROLE_OWNER})


async def merge_guest_records(phone: str, user_id: str) -> int:
    """When a user registers/logs in, merge any guest entries (matching phone) into the user.
    - Updates rsvps, goals, payments docs that reference the guest_id by replacing with user_id.
    - Removes guest documents.
    Returns number of guests merged.
    """
    db = get_db()
    if not phone:
        return 0

    guests = await db.guests.find({"phone": phone}).to_list(length=200)
    if not guests:
        return 0

    try:
        uid = ObjectId(user_id)
    except Exception:
        return 0

    merged = 0
    for g in guests:
        gid_val = g["_id"]
        # rewrite RSVPs
        await db.rsvps.update_many(
            {"guest_id": gid_val},
            {"$set": {"user_id": uid, "guest_id": None}},
        )
        # rewrite goals
        await db.goals.update_many(
            {"guest_id": gid_val},
            {"$set": {"user_id": uid, "guest_id": None}},
        )
        # rewrite payments
        await db.payments.update_many(
            {"guest_id": gid_val},
            {"$set": {"user_id": uid, "guest_id": None}},
        )
        # ensure membership in the same group
        existing = await db.memberships.find_one({"group_id": g["group_id"], "user_id": uid})
        if not existing:
            await db.memberships.insert_one({
                "group_id": g["group_id"],
                "user_id": uid,
                "role": ROLE_MEMBER,
                "joined_at": utc_now(),
            })
        await db.guests.delete_one({"_id": gid_val})
        merged += 1

    return merged
