"""OTP-based authentication routes (dual-mode SMS: Twilio or dev fallback)."""
from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, Depends

from deps import (
    AuthStartRequest,
    AuthVerifyRequest,
    JoinByCodeRequest,
    UpdateProfileRequest,
    OTP_TTL_MIN,
    OTP_RATE_LIMIT_PER_HOUR,
    OTP_RESEND_COOLDOWN_SECONDS,
    DEV_FALLBACK_OTP,
    ROLE_OWNER,
    ROLE_MEMBER,
    create_token,
    get_current_user_impl,
    get_db,
    normalize_phone,
    serialize_doc,
    utc_now,
)
from services.membership_service import merge_guest_records

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _is_twilio_configured() -> bool:
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_PHONE_NUMBER")
    )


def _gen_otp() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


async def _send_sms_via_twilio(phone: str, body: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(
            os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]
        )
        client.messages.create(
            body=body,
            from_=os.environ["TWILIO_PHONE_NUMBER"],
            to=phone,
        )
        return True
    except Exception as exc:
        logger.exception("Twilio send failure: %s", exc)
        return False


async def _create_and_send_otp(phone: str) -> dict:
    db = get_db()
    now = utc_now()

    # Rate limit: 5 SMS / hour for this phone
    one_hour_ago = now - timedelta(hours=1)
    recent_count = await db.otp_codes.count_documents(
        {"phone": phone, "created_at": {"$gte": one_hour_ago}}
    )
    if recent_count >= OTP_RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Превишен лимит на SMS. Опитай след 1 час.")

    # Resend cooldown: last OTP must be older than 60s
    last = await db.otp_codes.find_one({"phone": phone}, sort=[("created_at", -1)])
    if last and last.get("created_at"):
        last_at = last["created_at"]
        if isinstance(last_at, str):
            try:
                last_at = datetime.fromisoformat(last_at.replace("Z", "+00:00"))
            except Exception:
                last_at = None
        # Mongo returns naive datetimes; coerce to UTC-aware before subtraction
        if isinstance(last_at, datetime) and last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        if last_at and (now - last_at).total_seconds() < OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(OTP_RESEND_COOLDOWN_SECONDS - (now - last_at).total_seconds())
            raise HTTPException(status_code=429, detail=f"Изчакай {wait}s преди нов SMS.")

    code = _gen_otp()
    expires_at = now + timedelta(minutes=OTP_TTL_MIN)
    await db.otp_codes.insert_one({
        "phone": phone,
        "code": code,
        "expires_at": expires_at,
        "used": False,
        "created_at": now,
    })

    body = f"Вашият код за FootBallChat: {code}. Валиден 5 минути."
    dev_mode = not _is_twilio_configured()
    if dev_mode:
        logger.warning(f"[DEV-OTP] phone={phone} code={code} (fallback '{DEV_FALLBACK_OTP}' also accepted)")
    else:
        ok = await _send_sms_via_twilio(phone, body)
        if not ok:
            raise HTTPException(status_code=502, detail="Неуспешно изпращане на SMS")

    return {"success": True, "dev_mode": dev_mode}


async def _verify_otp(phone: str, code: str) -> bool:
    """Validate OTP. Marks it used. Dev fallback '123456' accepted only if Twilio not configured."""
    if not code or not isinstance(code, str):
        return False
    db = get_db()
    now = utc_now()

    if not _is_twilio_configured() and code == DEV_FALLBACK_OTP:
        # mark any existing unused otp as used (best-effort)
        await db.otp_codes.update_many({"phone": phone, "used": False}, {"$set": {"used": True}})
        return True

    rec = await db.otp_codes.find_one(
        {"phone": phone, "code": code, "used": False},
        sort=[("created_at", -1)],
    )
    if not rec:
        return False
    expires_at = rec.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except Exception:
            expires_at = None
    if not expires_at or expires_at < now:
        return False
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return True


def _user_to_response(user: dict) -> dict:
    s = serialize_doc(user) or {}
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "phone": s.get("phone"),
        "nickname": s.get("nickname"),
        "email": s.get("email"),
        "avatar_url": s.get("avatar_url"),
        "location": s.get("location"),
        "looking_for_game": s.get("looking_for_game", False),
        "reliability_score": s.get("reliability_score", 100),
        "reliability_stats": s.get("reliability_stats", {
            "total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0
        }),
        "push_prefs": s.get("push_prefs"),
        "created_at": s.get("created_at"),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/start")
async def auth_start(payload: AuthStartRequest):
    phone = normalize_phone(payload.phone)
    return await _create_and_send_otp(phone)


@router.post("/verify")
async def auth_verify(payload: AuthVerifyRequest):
    phone = normalize_phone(payload.phone)
    if not await _verify_otp(phone, payload.otp):
        raise HTTPException(status_code=400, detail="Невалиден или изтекъл код")

    db = get_db()
    user = await db.users.find_one({"phone": phone})
    if not user:
        return {"verified": True, "user_exists": False, "phone": phone}

    # Merge any guest records keyed by this phone
    await merge_guest_records(phone, str(user["_id"]))

    token = create_token(str(user["_id"]))
    return {"verified": True, "user_exists": True, "token": token, "user": _user_to_response(user)}


@router.post("/join")
async def auth_join(payload: JoinByCodeRequest):
    phone = normalize_phone(payload.phone)
    name = (payload.name or "").strip()
    code = (payload.entry_code or "").strip().upper()
    if not name:
        raise HTTPException(status_code=400, detail="Името е задължително")
    if not code:
        raise HTTPException(status_code=400, detail="Кодът на групата е задължителен")

    if payload.otp is not None:
        if not await _verify_otp(phone, payload.otp):
            raise HTTPException(status_code=400, detail="Невалиден или изтекъл код")
    else:
        # dev convenience: allow join when twilio not configured (no otp check)
        if _is_twilio_configured():
            raise HTTPException(status_code=400, detail="OTP е задължителен")

    db = get_db()
    group = await db.groups.find_one({"entry_code": code})
    if not group:
        raise HTTPException(status_code=404, detail="Група с този код не съществува")

    user = await db.users.find_one({"phone": phone})
    now = utc_now()
    if not user:
        user_doc = {
            "name": name,
            "phone": phone,
            "nickname": None,
            "email": None,
            "avatar_url": None,
            "expo_push_token": None,
            "push_prefs": {
                "new_matches": True,
                "reminders": True,
                "reminder_hours": 24,
                "rsvp_changes": False,
                "chat": True,
            },
            "location": None,
            "looking_for_game": False,
            "reliability_score": 100,
            "reliability_stats": {
                "total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0
            },
            "created_at": now,
        }
        result = await db.users.insert_one(user_doc)
        user = await db.users.find_one({"_id": result.inserted_id})

    user_id = user["_id"]
    existing_member = await db.memberships.find_one({"group_id": group["_id"], "user_id": user_id})
    if existing_member:
        raise HTTPException(status_code=400, detail="Вече си член на тази група")

    await db.memberships.insert_one({
        "group_id": group["_id"],
        "user_id": user_id,
        "role": ROLE_MEMBER,
        "joined_at": now,
    })

    await merge_guest_records(phone, str(user_id))

    token = create_token(str(user_id))
    return {
        "token": token,
        "user": _user_to_response(user),
        "group": {
            "id": str(group["_id"]),
            "name": group.get("name"),
            "entry_code": group.get("entry_code"),
            "currency": group.get("currency", "EUR"),
        },
    }


@router.post("/super-test-login")
async def super_test_login():
    if os.environ.get("SUPER_TEST_LOGIN_ENABLED", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Super test login disabled")
    db = get_db()
    phone = "+359888999999"
    user = await db.users.find_one({"phone": phone})
    now = utc_now()
    if not user:
        result = await db.users.insert_one({
            "name": "Super Tester",
            "phone": phone,
            "nickname": None,
            "email": None,
            "avatar_url": None,
            "expo_push_token": None,
            "push_prefs": {
                "new_matches": True,
                "reminders": True,
                "reminder_hours": 24,
                "rsvp_changes": False,
                "chat": True,
            },
            "location": None,
            "looking_for_game": False,
            "reliability_score": 100,
            "reliability_stats": {
                "total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0
            },
            "created_at": now,
        })
        user = await db.users.find_one({"_id": result.inserted_id})

    token = create_token(str(user["_id"]))
    return {"token": token, "user": _user_to_response(user)}


# ---------------------------------------------------------------------------
# Profile (/api/me)
# ---------------------------------------------------------------------------
me_router = APIRouter(prefix="/api/me", tags=["me"])


@me_router.get("")
async def get_me(current=Depends(get_current_user_impl)):
    return _user_to_response(current)


@me_router.patch("")
async def update_me(payload: UpdateProfileRequest, current=Depends(get_current_user_impl)):
    db = get_db()
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        try:
            uid = ObjectId(current["id"])
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid user id")
        await db.users.update_one({"_id": uid}, {"$set": update})
        updated = await db.users.find_one({"_id": uid})
    else:
        updated = current
        if "_id" in updated:
            updated = await db.users.find_one({"_id": ObjectId(current["id"])})
    return _user_to_response(updated)
