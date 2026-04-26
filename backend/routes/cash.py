"""Cash management — transactions CRUD, summary, player_balances, CSV export."""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse

from deps import (
    CashTxnCreateRequest,
    CashTxnUpdateRequest,
    check_pro_access,
    get_current_user_impl,
    get_db,
    require_admin,
    require_owner,
    utc_now,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/groups", tags=["cash"])


def _aware(dt):
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _serialize_txn(t: dict) -> dict:
    return {
        "id": str(t["_id"]),
        "type": t.get("type"),
        "category": t.get("category"),
        "amount": float(t.get("amount") or 0),
        "currency": t.get("currency", "EUR"),
        "note": t.get("note"),
        "counterparty": t.get("counterparty"),
        "status": t.get("status", "PAID"),
        "related_match_id": str(t["related_match_id"]) if t.get("related_match_id") else None,
        "match_id": str(t["match_id"]) if t.get("match_id") else None,
        "created_by_user_id": str(t["created_by_user_id"]) if t.get("created_by_user_id") else None,
        "created_at": t["created_at"].isoformat() if hasattr(t.get("created_at"), "isoformat") else t.get("created_at"),
        "paid_at": t["paid_at"].isoformat() if hasattr(t.get("paid_at"), "isoformat") else t.get("paid_at"),
    }


async def _player_balances(group_id: ObjectId) -> list[dict]:
    """Aggregate per-user totals: paid (sum across all matches' player_payments) and owed (amount across all matches)."""
    db = get_db()
    balances: dict = {}

    # Walk all matches in group
    async for m in db.matches.find({"group_id": group_id}):
        for p in (m.get("player_payments") or []):
            uid = p.get("user_id")
            if not uid:
                continue
            key = str(uid)
            entry = balances.setdefault(key, {
                "user_id": key, "name": p.get("name") or "",
                "total_paid": 0.0, "total_owed": 0.0,
            })
            entry["total_paid"] += float(p.get("paid_amount") or 0)
            entry["total_owed"] += float(p.get("amount") or 0)

    # Resolve names from users
    if balances:
        oids = []
        for k in balances.keys():
            try:
                oids.append(ObjectId(k))
            except Exception:
                pass
        async for u in db.users.find({"_id": {"$in": oids}}, {"_id": 1, "name": 1, "nickname": 1}):
            entry = balances.get(str(u["_id"]))
            if entry:
                entry["name"] = u.get("nickname") or u.get("name") or entry["name"]

    out = []
    for entry in balances.values():
        entry["total_paid"] = round(entry["total_paid"], 2)
        entry["total_owed"] = round(entry["total_owed"], 2)
        entry["balance"] = round(entry["total_paid"] - entry["total_owed"], 2)
        out.append(entry)
    out.sort(key=lambda x: x["balance"])
    return out


@router.get("/{group_id}/cash/summary")
async def cash_summary(group_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    group = await db.groups.find_one({"_id": gid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    cats = list(group.get("cash_categories") or [])
    inactive = set(group.get("inactive_categories") or [])

    total_income = 0.0
    total_expense = 0.0
    cat_totals: dict = {c: {"name": c, "total_income": 0.0, "total_expense": 0.0,
                            "is_active": c not in inactive} for c in cats}

    async for t in db.cash_transactions.find({"group_id": gid, "status": "PAID"}):
        amt = float(t.get("amount") or 0)
        cat = t.get("category") or "OTHER"
        cat_entry = cat_totals.setdefault(cat, {"name": cat, "total_income": 0.0,
                                                "total_expense": 0.0, "is_active": cat not in inactive})
        if t.get("type") == "INCOME":
            total_income += amt
            cat_entry["total_income"] += amt
        else:
            total_expense += amt
            cat_entry["total_expense"] += amt

    # round
    for c in cat_totals.values():
        c["total_income"] = round(c["total_income"], 2)
        c["total_expense"] = round(c["total_expense"], 2)

    recent = []
    async for t in db.cash_transactions.find({"group_id": gid}).sort("created_at", -1).limit(10):
        recent.append(_serialize_txn(t))

    return {
        "balance": round(total_income - total_expense, 2),
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "currency": "EUR",
        "categories": list(cat_totals.values()),
        "recent_transactions": recent,
        "player_balances": await _player_balances(gid),
    }


@router.get("/{group_id}/cash/transactions")
async def list_transactions(
    group_id: str,
    type: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    current=Depends(get_current_user_impl),
):
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    q: dict = {"group_id": gid}
    if type:
        q["type"] = type
    if category:
        q["category"] = category
    if status:
        q["status"] = status
    direction = -1 if sort_order.lower() == "desc" else 1
    total = await db.cash_transactions.count_documents(q)
    cursor = db.cash_transactions.find(q).sort(sort_by, direction).skip(skip).limit(limit)
    items = [_serialize_txn(t) async for t in cursor]
    pages = (total + limit - 1) // limit if limit else 1
    return {"transactions": items, "total_count": total, "total_pages": pages}


@router.post("/{group_id}/cash/transactions")
async def create_transaction(group_id: str, payload: CashTxnCreateRequest,
                              current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    if payload.type not in ("INCOME", "EXPENSE"):
        raise HTTPException(status_code=400, detail="type трябва да е INCOME или EXPENSE")
    if payload.status not in ("PLANNED", "PAID"):
        raise HTTPException(status_code=400, detail="status трябва да е PLANNED или PAID")
    if not payload.amount or payload.amount <= 0:
        raise HTTPException(status_code=400, detail="amount > 0")

    group = await db.groups.find_one({"_id": gid})
    cats = list(group.get("cash_categories") or [])
    inactive = set(group.get("inactive_categories") or [])
    if payload.category not in cats:
        raise HTTPException(status_code=400, detail="Невалидна категория")
    if payload.category in inactive:
        raise HTTPException(status_code=400, detail="Категорията е деактивирана")

    now = utc_now()
    doc = {
        "group_id": gid,
        "type": payload.type,
        "category": payload.category,
        "amount": round(float(payload.amount), 2),
        "currency": "EUR",
        "note": payload.note,
        "counterparty": payload.counterparty,
        "status": payload.status,
        "related_match_id": ObjectId(payload.related_match_id) if payload.related_match_id else None,
        "created_by_user_id": ObjectId(current["id"]),
        "created_at": now,
        "paid_at": now if payload.status == "PAID" else None,
    }
    res = await db.cash_transactions.insert_one(doc)
    saved = await db.cash_transactions.find_one({"_id": res.inserted_id})
    return _serialize_txn(saved)


@router.patch("/{group_id}/cash/transactions/{tx_id}")
async def update_transaction(group_id: str, tx_id: str, payload: CashTxnUpdateRequest,
                              current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        tid = ObjectId(tx_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "amount" in update:
        if float(update["amount"]) <= 0:
            raise HTTPException(status_code=400, detail="amount > 0")
        update["amount"] = round(float(update["amount"]), 2)
    if "status" in update and update["status"] == "PAID":
        update["paid_at"] = utc_now()
    if update:
        res = await db.cash_transactions.update_one(
            {"_id": tid, "group_id": gid}, {"$set": update}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Транзакцията не е намерена")
    saved = await db.cash_transactions.find_one({"_id": tid, "group_id": gid})
    return _serialize_txn(saved)


@router.delete("/{group_id}/cash/transactions/{tx_id}")
async def delete_transaction(group_id: str, tx_id: str, current=Depends(get_current_user_impl)):
    await check_pro_access(group_id)
    await require_owner(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
        tid = ObjectId(tx_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    res = await db.cash_transactions.delete_one({"_id": tid, "group_id": gid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Транзакцията не е намерена")
    return {"deleted": True}


@router.get("/{group_id}/cash/export")
async def export_cash(
    group_id: str,
    format: str = "csv",
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    current=Depends(get_current_user_impl),
):
    await check_pro_access(group_id)
    await require_admin(current["id"], group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
    q: dict = {"group_id": gid}
    if period_start or period_end:
        q["created_at"] = {}
        if period_start:
            ps = _aware(period_start)
            if ps:
                q["created_at"]["$gte"] = ps
        if period_end:
            pe = _aware(period_end)
            if pe:
                q["created_at"]["$lte"] = pe
    items = []
    async for t in db.cash_transactions.find(q).sort("created_at", -1):
        items.append(_serialize_txn(t))

    if format == "json":
        return JSONResponse(content={"transactions": items, "currency": "EUR"})

    # CSV
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Type", "Category", "Amount", "Currency", "Note", "Status", "CreatedBy"])
    for t in items:
        writer.writerow([
            t["created_at"], t["type"], t["category"], f"{t['amount']:.2f}",
            t["currency"], (t.get("note") or "").replace("\n", " "),
            t["status"], t.get("created_by_user_id") or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cash_{group_id}.csv"'},
    )


@router.get("/{group_id}/finance-summary")
async def finance_summary(group_id: str, current=Depends(get_current_user_impl)):
    """Per-match financial breakdown across the group."""
    await check_pro_access(group_id)
    db = get_db()
    try:
        gid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")

    matches_out = []
    totals = {"total_cost": 0.0, "total_collected": 0.0,
              "total_outstanding": 0.0, "total_cash_contribution": 0.0}
    async for m in db.matches.find({"group_id": gid}).sort("start_datetime", -1):
        pricing = m.get("pricing_mode") or "SPLIT"
        total_cost = float(m.get("total_cost") or 0)
        # going count
        going = await db.rsvps.count_documents({"match_id": m["_id"], "status": "going"})
        price_pp = float(m.get("price_per_player") or 0)
        if pricing == "SPLIT":
            expected = round(total_cost, 2)
        elif pricing == "FIXED":
            expected = round(price_pp * going, 2)
        elif pricing == "SPLIT_WITH_CASH":
            expected = round(price_pp * going, 2)
        else:
            expected = 0.0

        collected = sum(float(p.get("paid_amount") or 0) for p in (m.get("player_payments") or [])
                        if p.get("status") in ("PAID", "OVERPAID"))
        outstanding = max(0.0, expected - collected)

        if pricing == "SPLIT_WITH_CASH":
            cash_contrib = max(0.0, total_cost - price_pp * going)
        elif pricing == "CASH_PAYS_ALL":
            cash_contrib = total_cost
        else:
            cash_contrib = 0.0

        totals["total_cost"] += total_cost
        totals["total_collected"] += collected
        totals["total_outstanding"] += outstanding
        totals["total_cash_contribution"] += cash_contrib

        matches_out.append({
            "match_id": str(m["_id"]),
            "match_name": m.get("name"),
            "date": m["start_datetime"].isoformat() if hasattr(m.get("start_datetime"), "isoformat") else m.get("start_datetime"),
            "total_cost": round(total_cost, 2),
            "pricing_mode": pricing,
            "expected_from_players": round(expected, 2),
            "collected": round(collected, 2),
            "outstanding": round(outstanding, 2),
            "cash_contribution": round(cash_contrib, 2),
            "player_count": going,
        })

    return {
        "matches": matches_out,
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "currency": "EUR",
    }
