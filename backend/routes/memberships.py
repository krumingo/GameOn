"""Members & guests management."""
from __future__ import annotations

import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from deps import (
    AddMemberRequest,
    AddGuestRequest,
    UpdateMemberRoleRequest,
    ROLE_OWNER,
    ROLE_ORGANIZER,
    ROLE_MEMBER,
    get_current_user_impl,
    get_db,
    mask_phone,
    normalize_phone,
    require_admin,
    require_owner,
    utc_now,
)
from services.membership_service import list_members_with_users

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/groups", tags=["memberships"])


@router.get("/{group_id}/memberships")
async def list_memberships(group_id: str, current=Depends(get_current_user_impl)):
    return await list_members_with_users(group_id, include_guests=False)


@router.get("/{group_id}/members")
async def list_members(group_id: str, current=Depends(get_current_user_impl)):
    return await list_members_with_users(group_id, include_guests=True)


@router.post("/{group_id}/members")
async def add_member(group_id: str, payload: AddMemberRequest, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = ObjectId(group_id)
    phone = normalize_phone(payload.phone)
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=404, detail="Потребителят не е намерен. Може да го добавиш като гост.")
    existing = await db.memberships.find_one({"group_id": gid, "user_id": user["_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Вече е член на групата")
    role = payload.role if payload.role in (ROLE_MEMBER, ROLE_ORGANIZER) else ROLE_MEMBER
    await db.memberships.insert_one({
        "group_id": gid,
        "user_id": user["_id"],
        "role": role,
        "joined_at": utc_now(),
    })
    return {
        "id": str(user["_id"]),
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "phone_masked": mask_phone(user.get("phone", "")),
        "role": role,
    }


@router.post("/{group_id}/guests")
async def add_guest(group_id: str, payload: AddGuestRequest, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    gid = ObjectId(group_id)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Името е задължително")
    phone = None
    if payload.phone:
        phone = normalize_phone(payload.phone)
    doc = {
        "name": name,
        "phone": phone,
        "group_id": gid,
        "added_by_user_id": ObjectId(current["id"]),
        "created_at": utc_now(),
    }
    result = await db.guests.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "name": name,
        "phone_masked": mask_phone(phone) if phone else None,
        "is_guest": True,
    }


@router.delete("/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, current=Depends(get_current_user_impl)):
    role = await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        mid = ObjectId(member_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Membership not found")

    membership = await db.memberships.find_one({"_id": mid, "group_id": gid})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    target_role = membership.get("role")
    if target_role == ROLE_OWNER:
        raise HTTPException(status_code=400, detail="OWNER не може да бъде премахнат")
    if role == ROLE_ORGANIZER and target_role == ROLE_ORGANIZER:
        raise HTTPException(status_code=403, detail="ORGANIZER може да премахва само MEMBER")

    if str(membership["user_id"]) == current["id"]:
        raise HTTPException(status_code=400, detail="Не можеш да премахнеш себе си")

    await db.memberships.delete_one({"_id": mid})
    return {"deleted": True}


@router.patch("/{group_id}/members/{member_id}/role")
async def change_role(group_id: str, member_id: str, payload: UpdateMemberRoleRequest, current=Depends(get_current_user_impl)):
    await require_owner(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        mid = ObjectId(member_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Membership not found")
    new_role = payload.role
    if new_role not in (ROLE_ORGANIZER, ROLE_MEMBER):
        raise HTTPException(status_code=400, detail="Невалидна роля")

    membership = await db.memberships.find_one({"_id": mid, "group_id": gid})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.get("role") == ROLE_OWNER:
        raise HTTPException(status_code=400, detail="Не можеш да смениш ролята на OWNER")

    await db.memberships.update_one({"_id": mid}, {"$set": {"role": new_role}})
    return {"id": str(mid), "role": new_role}


@router.delete("/{group_id}/guests/{guest_id}")
async def remove_guest(group_id: str, guest_id: str, current=Depends(get_current_user_impl)):
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        gst = ObjectId(guest_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Guest not found")
    res = await db.guests.delete_one({"_id": gst, "group_id": gid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Guest not found")
    return {"deleted": True}
