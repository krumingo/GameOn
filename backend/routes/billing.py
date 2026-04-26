"""Billing routes — Stripe + PRO/FREE/TRIAL/GRACE plan management."""
from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request

from deps import (
    CheckoutSessionRequestModel,
    PortalRequestModel,
    get_current_user_impl,
    get_db,
    get_group_plan,
    require_admin,
    trial_days_left,
    pro_until,
    utc_now,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])
webhook_router = APIRouter(prefix="/api/webhook", tags=["billing"])

FEATURES_LOCKED_FREE = [
    "payments", "teams", "leaderboard", "cash",
    "listings", "seasons", "search_player", "export",
]


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


@router.get("/group/{group_id}")
async def get_billing_status(group_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    bill = await db.billing.find_one({"group_id": gid})
    plan = await get_group_plan(group_id)
    is_trial = bool(bill and bill.get("is_trial")) and plan == "TRIAL"
    period_end = _ensure_aware((bill or {}).get("period_end"))
    grace_until = None
    days_left = 0
    if plan in ("PRO", "TRIAL") and period_end:
        days_left = max(0, (period_end - utc_now()).days)
    if plan == "GRACE" and period_end:
        grace_until = (period_end + timedelta(days=3)).isoformat()
        days_left = max(0, ((period_end + timedelta(days=3)) - utc_now()).days)

    features_locked = [] if plan in ("PRO", "TRIAL", "GRACE") else FEATURES_LOCKED_FREE
    return {
        "plan": plan,
        "is_trial": is_trial,
        "expires_at": period_end.isoformat() if period_end else None,
        "grace_until": grace_until,
        "days_left": days_left,
        "trial_days_left": await trial_days_left(group_id) if is_trial else None,
        "pro_until": await pro_until(group_id),
        "features_locked": features_locked,
    }


@router.post("/group/{group_id}/mark-paid")
async def mark_paid(group_id: str, current=Depends(get_current_user_impl)):
    """Manual PRO activation (admin/test)."""
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    now = utc_now()
    period_end = now + timedelta(days=30)
    await db.billing.update_one(
        {"group_id": gid},
        {"$set": {
            "group_id": gid,
            "plan": "PRO",
            "status": "active",
            "is_trial": False,
            "period_start": now,
            "period_end": period_end,
            "currency": "EUR",
            "updated_at": now,
        }},
        upsert=True,
    )
    return {"plan": "PRO", "period_end": period_end.isoformat()}


# ---------------------------------------------------------------------------
# Stripe Checkout (subscription = monthly recurring activation)
# ---------------------------------------------------------------------------
def _stripe():
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    return StripeCheckout(api_key=api_key, webhook_url=os.environ.get(
        "STRIPE_WEBHOOK_URL", "https://example.com/api/webhook/stripe"
    ))


@router.post("/checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequestModel,
                                   current=Depends(get_current_user_impl)):
    await require_admin(current["id"], payload.group_id)
    db = get_db()
    try:
        gid = ObjectId(payload.group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")

    # Server-side fixed amount (security)
    amount = float(os.environ.get("PRO_MONTHLY_PRICE_EUR", "5.00"))
    currency = "eur"

    origin = (payload.origin_url or "").rstrip("/")
    if not origin:
        raise HTTPException(status_code=400, detail="origin_url е задължителен")
    success_url = f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/billing/cancel"

    from emergentintegrations.payments.stripe.checkout import (
        CheckoutSessionRequest,
    )
    stripe = _stripe()
    metadata = {
        "group_id": str(gid),
        "user_id": str(current["id"]),
        "plan": "PRO_MONTHLY",
    }
    req = CheckoutSessionRequest(
        amount=amount,
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    try:
        session = await stripe.create_checkout_session(req)
    except Exception as exc:
        logger.exception("Stripe error: %s", exc)
        raise HTTPException(status_code=502, detail="Грешка при създаване на checkout сесия")

    now = utc_now()
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "group_id": gid,
        "user_id": ObjectId(current["id"]),
        "amount": amount,
        "currency": "EUR",
        "metadata": metadata,
        "payment_status": "initiated",
        "status": "PENDING",
        "created_at": now,
        "updated_at": now,
    })
    return {"checkout_url": session.url, "session_id": session.session_id}


@router.get("/checkout-status/{session_id}")
async def checkout_status(session_id: str, current=Depends(get_current_user_impl)):
    db = get_db()
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Транзакцията не е намерена")

    stripe = _stripe()
    try:
        status = await stripe.get_checkout_status(session_id)
    except Exception as exc:
        logger.exception("Stripe status error: %s", exc)
        raise HTTPException(status_code=502, detail="Грешка при четене на статус")

    payment_status = status.payment_status

    # Idempotent activation
    if payment_status == "paid" and txn.get("payment_status") != "paid":
        gid = txn["group_id"]
        now = utc_now()
        period_end = now + timedelta(days=30)
        await db.billing.update_one(
            {"group_id": gid},
            {"$set": {
                "group_id": gid,
                "plan": "PRO",
                "status": "active",
                "is_trial": False,
                "period_start": now,
                "period_end": period_end,
                "currency": "EUR",
                "updated_at": now,
            }},
            upsert=True,
        )

    await db.payment_transactions.update_one(
        {"_id": txn["_id"]},
        {"$set": {"payment_status": payment_status, "status": status.status, "updated_at": utc_now()}},
    )
    return {
        "status": status.status,
        "payment_status": payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@router.post("/portal")
async def billing_portal(payload: PortalRequestModel, current=Depends(get_current_user_impl)):
    """Stub: full Stripe Customer Portal needs subscription, not one-off checkout.
    For MVP returns a friendly message."""
    await require_admin(current["id"], payload.group_id)
    return {
        "portal_url": None,
        "message": "Portal-ът ще бъде наличен след първото успешно плащане през Stripe Subscriptions.",
    }


# ---------------------------------------------------------------------------
# Webhook (no auth — verified by Stripe-Signature header)
# ---------------------------------------------------------------------------
@webhook_router.post("/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature") or request.headers.get("stripe-signature")
    stripe = _stripe()
    try:
        event = await stripe.handle_webhook(body, sig)
    except Exception as exc:
        logger.exception("Webhook verify failed: %s", exc)
        raise HTTPException(status_code=400, detail="Невалиден webhook")

    db = get_db()
    session_id = event.session_id
    payment_status = event.payment_status
    metadata = event.metadata or {}

    if session_id:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": payment_status, "updated_at": utc_now(),
                      "webhook_event_type": event.event_type}},
        )

    if payment_status == "paid" and metadata.get("group_id"):
        try:
            gid = ObjectId(metadata["group_id"])
        except Exception:
            return {"received": True}
        existing = await db.payment_transactions.find_one({
            "session_id": session_id, "group_id": gid, "activated": True
        })
        if not existing:
            now = utc_now()
            period_end = now + timedelta(days=30)
            await db.billing.update_one(
                {"group_id": gid},
                {"$set": {
                    "group_id": gid,
                    "plan": "PRO",
                    "status": "active",
                    "is_trial": False,
                    "period_start": now,
                    "period_end": period_end,
                    "currency": "EUR",
                    "updated_at": now,
                }},
                upsert=True,
            )
            await db.payment_transactions.update_one(
                {"session_id": session_id}, {"$set": {"activated": True}}
            )
    return {"received": True}
