"""Shared dependencies, helpers, models, constants for FootBallChat backend."""
from __future__ import annotations

import os
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, List

import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ROLE_OWNER = "OWNER"
ROLE_ORGANIZER = "ORGANIZER"
ROLE_MEMBER = "MEMBER"

CURRENCY = "EUR"

DEFAULT_POINTS_CONFIG = {"win": 3, "draw": 1, "loss": 0}
DEFAULT_CASH_CATEGORIES = [
    "MATCH_FEES",
    "BALLS",
    "EQUIPMENT",
    "KITS",
    "BANQUET",
    "PITCH_PAYMENT",
    "OTHER",
]

FREE_MAX_GROUPS = 1
FREE_MAX_PLAYERS_PER_MATCH = 14

OTP_TTL_MIN = 5
OTP_RATE_LIMIT_PER_HOUR = 5
OTP_RESEND_COOLDOWN_SECONDS = 60

JWT_ALG = "HS256"
JWT_EXPIRY_DAYS = 30

DEV_FALLBACK_OTP = "123456"

# ---------------------------------------------------------------------------
# Database singleton
# ---------------------------------------------------------------------------
db = None  # set via set_db() during app lifespan


def set_db(database) -> None:
    """Set the global Motor database reference."""
    global db
    db = database


def get_db():
    if db is None:
        raise RuntimeError("Database not initialised. Call set_db() during lifespan.")
    return db


# ---------------------------------------------------------------------------
# Time / serialization helpers
# ---------------------------------------------------------------------------
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_doc(doc: Optional[dict]) -> Optional[dict]:
    """Convert MongoDB document -> JSON-friendly dict.
    - _id -> id (string)
    - ObjectId -> str
    - datetime -> ISO 8601 string
    Recursively handles nested dicts and lists.
    """
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if not isinstance(doc, dict):
        if isinstance(doc, ObjectId):
            return str(doc)
        if isinstance(doc, datetime):
            return doc.isoformat()
        return doc

    out: dict = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v) if isinstance(v, ObjectId) else v
            continue
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = serialize_doc(v)
        elif isinstance(v, list):
            out[k] = [serialize_doc(x) if isinstance(x, (dict, list)) else
                      (str(x) if isinstance(x, ObjectId) else
                       (x.isoformat() if isinstance(x, datetime) else x))
                      for x in v]
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# Phone helpers
# ---------------------------------------------------------------------------
PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def normalize_phone(phone: str) -> str:
    if not isinstance(phone, str):
        raise HTTPException(status_code=400, detail="Невалиден телефон")
    p = phone.strip().replace(" ", "").replace("-", "")
    if not p.startswith("+"):
        # try to be helpful: if starts with 0 - cannot guess country, reject.
        raise HTTPException(status_code=400, detail="Телефонът трябва да е в E.164 формат (+359...)")
    if not PHONE_RE.match(p):
        raise HTTPException(status_code=400, detail="Невалиден телефон. Използвай E.164 формат (+359888123456)")
    return p


def mask_phone(phone: str) -> str:
    """Mask middle digits of phone, keeping country prefix (+xxx) and last 4."""
    if not phone or not isinstance(phone, str):
        return ""
    if len(phone) <= 8:
        return phone
    head = phone[:4]
    tail = phone[-4:]
    return f"{head}***{tail}"


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET env not set")
    return secret


def create_token(user_id: str) -> str:
    payload = {
        "sub": str(user_id),
        "iat": int(utc_now().timestamp()),
        "exp": int((utc_now() + timedelta(days=JWT_EXPIRY_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def get_current_user_impl(request: Request) -> dict:
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id in token")
    user = await get_db().users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    serialized = serialize_doc(user)
    return serialized


CurrentUser = Depends(get_current_user_impl)


# ---------------------------------------------------------------------------
# Roles / plan helpers
# ---------------------------------------------------------------------------
async def get_user_role_in_group(user_id: str, group_id: str) -> Optional[str]:
    try:
        gid = ObjectId(group_id)
    except Exception:
        return None
    try:
        uid = ObjectId(user_id)
    except Exception:
        return None
    m = await get_db().memberships.find_one(
        {"group_id": gid, "user_id": uid}, {"_id": 0, "role": 1}
    )
    return m["role"] if m else None


async def is_admin(user_id: str, group_id: str) -> bool:
    role = await get_user_role_in_group(user_id, group_id)
    return role in (ROLE_OWNER, ROLE_ORGANIZER)


async def require_admin(user_id: str, group_id: str) -> str:
    role = await get_user_role_in_group(user_id, group_id)
    if role not in (ROLE_OWNER, ROLE_ORGANIZER):
        raise HTTPException(status_code=403, detail="Need OWNER or ORGANIZER role")
    return role


async def require_owner(user_id: str, group_id: str) -> str:
    role = await get_user_role_in_group(user_id, group_id)
    if role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Only OWNER can perform this action")
    return role


async def get_group_plan(group_id: str) -> str:
    """Return plan: PRO | TRIAL | GRACE | FREE."""
    try:
        gid = ObjectId(group_id)
    except Exception:
        return "FREE"
    bill = await get_db().billing.find_one({"group_id": gid})
    if not bill:
        return "FREE"
    status = bill.get("status")
    period_end = bill.get("period_end")
    is_trial = bill.get("is_trial", False)
    now = utc_now()
    if isinstance(period_end, str):
        try:
            period_end = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
        except Exception:
            period_end = None
    if isinstance(period_end, datetime) and period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)

    if status == "active" and period_end and period_end > now:
        return "TRIAL" if is_trial else "PRO"
    if status == "grace" and period_end and period_end > now:
        return "GRACE"
    return "FREE"


async def trial_days_left(group_id: str) -> Optional[int]:
    try:
        gid = ObjectId(group_id)
    except Exception:
        return None
    bill = await get_db().billing.find_one({"group_id": gid})
    if not bill or not bill.get("is_trial"):
        return None
    period_end = bill.get("period_end")
    if isinstance(period_end, str):
        try:
            period_end = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
        except Exception:
            return None
    if not period_end:
        return None
    if isinstance(period_end, datetime) and period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    delta = period_end - utc_now()
    return max(0, delta.days)


async def pro_until(group_id: str) -> Optional[str]:
    try:
        gid = ObjectId(group_id)
    except Exception:
        return None
    bill = await get_db().billing.find_one({"group_id": gid})
    if not bill or bill.get("is_trial"):
        return None
    period_end = bill.get("period_end")
    if isinstance(period_end, datetime):
        return period_end.isoformat()
    return period_end


async def check_pro_access(group_id: str) -> None:
    plan = await get_group_plan(group_id)
    if plan not in ("PRO", "TRIAL", "GRACE"):
        raise HTTPException(
            status_code=403,
            detail={"code": "PLAN_PRO_REQUIRED", "message": "Тази функция изисква PRO план"},
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AuthStartRequest(BaseModel):
    phone: str


class AuthVerifyRequest(BaseModel):
    phone: str
    otp: str


class JoinByCodeRequest(BaseModel):
    name: str
    phone: str
    entry_code: str
    otp: Optional[str] = None


class CreateGroupRequest(BaseModel):
    name: str
    default_player_limit: int = 14
    entry_code: Optional[str] = None
    location: Optional[dict] = None
    venue: Optional[str] = None
    points_config: Optional[dict] = None


class JoinGroupRequest(BaseModel):
    entry_code: str


class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    default_player_limit: Optional[int] = None
    location: Optional[dict] = None
    venue: Optional[str] = None
    points_config: Optional[dict] = None


class AddCategoryRequest(BaseModel):
    category: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    email: Optional[str] = None
    location: Optional[Any] = None


class AddMemberRequest(BaseModel):
    phone: str
    name: Optional[str] = None
    role: str = ROLE_MEMBER


class UpdateMemberRoleRequest(BaseModel):
    role: str


class AddGuestRequest(BaseModel):
    name: str
    phone: Optional[str] = None



# ---------------------------------------------------------------------------
# Match / RSVP / Teams / Payments / Results models
# ---------------------------------------------------------------------------
class CreateMatchRequest(BaseModel):
    name: str
    venue: Optional[str] = None
    location_link: Optional[str] = None
    start_datetime: str  # ISO 8601
    total_cost: float = 0
    price_per_player: float = 0
    pricing_mode: str = "SPLIT"  # FIXED | SPLIT | SPLIT_WITH_CASH | CASH_PAYS_ALL
    recurrence: str = "ONE_TIME"  # ONE_TIME | WEEKLY
    player_limit: int = 14
    join_mode: str = "AUTO"  # AUTO | APPROVAL


class UpdateMatchRequest(BaseModel):
    name: Optional[str] = None
    venue: Optional[str] = None
    location_link: Optional[str] = None
    start_datetime: Optional[str] = None
    recurrence: Optional[str] = None
    player_limit: Optional[int] = None
    pricing_mode: Optional[str] = None
    total_cost: Optional[float] = None
    price_per_player: Optional[float] = None
    join_mode: Optional[str] = None
    status: Optional[str] = None


class CancelMatchRequest(BaseModel):
    reason: Optional[str] = None


class RSVPRequest(BaseModel):
    status: str  # going | not_going


class RSVPGuestRequest(BaseModel):
    guest_id: str
    status: str  # going | not_going


class RSVPBulkRequest(BaseModel):
    user_ids: list[str]
    status: str = "going"


class RSVPRemoveRequest(BaseModel):
    user_id: str
    reason: Optional[str] = None


class RSVPApprovalRequest(BaseModel):
    user_id: str
    action: str  # approve | reject


class MarkPaymentRequest(BaseModel):
    user_id: Optional[str] = None
    guest_id: Optional[str] = None
    status: str  # PAID | UNPAID
    paid_amount: Optional[float] = None
    amount: Optional[float] = None


class SetGoalsRequest(BaseModel):
    user_id: Optional[str] = None
    guest_id: Optional[str] = None
    goals: int


class SetMatchScoreRequest(BaseModel):
    blue_goals: int
    red_goals: int


class SetCaptainsRequest(BaseModel):
    blue_captain_id: str
    red_captain_id: str


class PickPlayerRequest(BaseModel):
    user_id: str


class TransferPlayerRequest(BaseModel):
    user_id: str
    from_team: str  # BLUE | RED
    to_team: str  # BLUE | RED


class ReturnPlayerRequest(BaseModel):
    user_id: str




# ---------------------------------------------------------------------------
# Billing / Cash / Stats / Seasons / Chat / Listings / Admin / Dev models
# ---------------------------------------------------------------------------
class CheckoutSessionRequestModel(BaseModel):
    group_id: str
    origin_url: str


class PortalRequestModel(BaseModel):
    group_id: str
    return_url: str


class CashTxnCreateRequest(BaseModel):
    type: str  # INCOME | EXPENSE
    category: str
    amount: float
    note: Optional[str] = None
    counterparty: Optional[str] = None
    status: str = "PAID"  # PLANNED | PAID
    related_match_id: Optional[str] = None


class CashTxnBulkEntry(BaseModel):
    user_id: str          # member of the group who paid
    amount: float         # how much THIS person paid (can differ between entries)
    note: Optional[str] = None  # optional per-person note (e.g., "пари в брой")


class CashTxnBulkRequest(BaseModel):
    type: str = "INCOME"  # bulk is typically INCOME (collection); allow EXPENSE too for symmetry
    category: str
    note: Optional[str] = None      # shared note for all transactions (e.g., "Банкет 22 март")
    entries: List[CashTxnBulkEntry]  # one entry per person who paid


class CashTxnUpdateRequest(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None
    counterparty: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None


class SeasonCreateRequest(BaseModel):
    name: str
    start_at: str
    end_at: str


class SeasonUpdateRequest(BaseModel):
    name: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None


class ChatMessageRequest(BaseModel):
    text: str
    match_id: Optional[str] = None


class ListingCreateRequest(BaseModel):
    type: str  # MATCH_AVAILABLE | LOOKING_FOR_PLAYERS | LOOKING_FOR_TEAM
    title: str
    description: Optional[str] = None
    venue: Optional[str] = None
    location: Optional[dict] = None
    date: Optional[str] = None
    time: Optional[str] = None
    spots_needed: Optional[int] = None
    total_players: Optional[int] = None
    price_per_player: Optional[float] = None
    group_id: Optional[str] = None
    match_id: Optional[str] = None


class ListingRespondRequest(BaseModel):
    message: Optional[str] = None


class InviteRequest(BaseModel):
    user_id: str
    message: Optional[str] = None


class InvitationActionRequest(BaseModel):
    action: str  # accept | decline


class AdminLoginRequest(BaseModel):
    email: str
    password: str

class LockTeamsRequest(BaseModel):
    locked: bool


class SetDraftVisibilityRequest(BaseModel):
    draft_visible: bool
