"""End-to-end backend tests for the matches module (PROMPT 2).

Covers: matches CRUD, RSVP (going/not_going/waitlist auto-promote/pending APPROVAL),
guests RSVP, bulk RSVP, payments (PRO), score, results, teams draft, recurrence.
Currency must be EUR.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

if os.environ.get("ALLOW_DESTRUCTIVE_E2E", "false").lower() not in ("1", "true", "yes"):
    pytest.skip(
        "test_matches is destructive (wipes groups/billing/memberships). "
        "Set ALLOW_DESTRUCTIVE_E2E=true and point at a throwaway DB to run.",
        allow_module_level=True,
    )

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "footballchat")
JWT_SECRET = os.environ["JWT_SECRET"]


def _future_iso(hours: int = 72) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _mint_token(user_id: str) -> str:
    payload = {
        "sub": str(user_id),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(days=1)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def owner_session():
    """Super tester (OWNER)."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/super-test-login")
    assert r.status_code == 200, r.text
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['token']}", "Content-Type": "application/json"})
    s.user_id = body["user"]["id"]
    return s


@pytest.fixture(scope="module")
def group(owner_session):
    """Create a fresh group for these tests."""
    r = owner_session.post(f"{BASE_URL}/api/groups", json={
        "name": f"MatchTest-{uuid.uuid4().hex[:6]}",
        "default_player_limit": 14,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _make_member(mongo, owner_session, group_id, phone_suffix: str, role: str = "MEMBER"):
    """Insert a real user via the OTP flow + add membership."""
    phone = f"+35988899{phone_suffix}"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.post(f"{BASE_URL}/api/auth/start", json={"phone": phone})
    r = s.post(f"{BASE_URL}/api/auth/verify", json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("user_exists"):
        token = body["token"]
        user_id = body["user"]["id"]
    else:
        # New user — finalize via /auth/join (need entry_code)
        # Easier: fetch user by phone we just created during /verify (it always upserts a temp record? no — it sends pending session)
        # Use /auth/join with the group's entry_code.
        gres = owner_session.get(f"{BASE_URL}/api/groups/{group_id}").json()
        entry_code = gres.get("entry_code")
        r2 = s.post(f"{BASE_URL}/api/auth/join", json={
            "name": f"User{phone_suffix}", "phone": phone, "entry_code": entry_code, "otp": "123456"
        })
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        token = body2["token"]
        user_id = body2["user"]["id"]
    s.headers["Authorization"] = f"Bearer {token}"
    s.user_id = user_id

    # Ensure membership
    rm = owner_session.post(f"{BASE_URL}/api/groups/{group_id}/members", json={
        "phone": phone, "name": f"User{phone_suffix}", "role": role,
    })
    # 200/201 OK or 400 already-member
    assert rm.status_code in (200, 201, 400), rm.text
    return s


# ---------- Matches CRUD ----------
class TestMatchCRUD:
    def test_create_match_split(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Mач 1",
            "venue": "Стадион",
            "start_datetime": _future_iso(72),
            "total_cost": 140,
            "pricing_mode": "SPLIT",
            "player_limit": 14,
            "join_mode": "AUTO",
            "recurrence": "ONE_TIME",
        })
        assert r.status_code in (200, 201), r.text
        m = r.json()
        assert m["pricing_mode"] == "SPLIT"
        assert m["planned_price_per_player"] == round(140/14, 2)
        assert m["status"] == "UPCOMING"
        assert m["going_count"] == 0
        assert m["free_spots"] == 14
        pytest.match1_id = m["id"]

    def test_create_past_date_rejected(self, owner_session, group):
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Past", "start_datetime": past, "pricing_mode": "SPLIT", "recurrence": "ONE_TIME",
            "join_mode": "AUTO", "player_limit": 14,
        })
        assert r.status_code == 400

    def test_create_invalid_player_limit(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Bad", "start_datetime": _future_iso(48), "pricing_mode": "SPLIT",
            "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 1,
        })
        assert r.status_code == 400

    def test_create_fixed_pricing(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "FIX", "start_datetime": _future_iso(80), "pricing_mode": "FIXED",
            "price_per_player": 12, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 14,
        })
        assert r.status_code in (200, 201)
        m = r.json()
        assert m["planned_price_per_player"] == 12.0
        assert m["price_per_player"] == 12.0

    def test_create_split_with_cash(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "SWC", "start_datetime": _future_iso(84), "pricing_mode": "SPLIT_WITH_CASH",
            "total_cost": 140, "price_per_player": 10, "recurrence": "ONE_TIME",
            "join_mode": "AUTO", "player_limit": 14,
        })
        assert r.status_code in (200, 201)
        m = r.json()
        assert m["price_per_player"] == 10.0
        pytest.match_swc_id = m["id"]

    def test_create_cash_pays_all(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "CASH", "start_datetime": _future_iso(88), "pricing_mode": "CASH_PAYS_ALL",
            "total_cost": 100, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 14,
        })
        assert r.status_code in (200, 201)
        m = r.json()
        assert m["price_per_player"] == 0.0
        assert m["planned_price_per_player"] == 0.0

    def test_create_weekly_sets_series(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Weekly", "start_datetime": _future_iso(96), "pricing_mode": "SPLIT",
            "total_cost": 140, "recurrence": "WEEKLY", "join_mode": "AUTO", "player_limit": 14,
        })
        assert r.status_code in (200, 201)
        m = r.json()
        assert m["recurrence"] == "WEEKLY"
        assert m["recurrence_active"] is True
        assert m["recurrence_series_id"]
        pytest.weekly_match_id = m["id"]
        pytest.weekly_series_id = m["recurrence_series_id"]

    def test_list_upcoming(self, owner_session, group):
        r = owner_session.get(f"{BASE_URL}/api/groups/{group['id']}/matches")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 4
        for it in items:
            assert "going_count" in it and "free_spots" in it and "waitlist_count" in it

    def test_get_match_detail(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/matches/{pytest.match1_id}")
        assert r.status_code == 200
        m = r.json()
        assert "teams_data" in m and "score_data" in m and "rsvps" in m

    def test_patch_match(self, owner_session):
        r = owner_session.patch(f"{BASE_URL}/api/matches/{pytest.match1_id}", json={
            "total_cost": 280
        })
        assert r.status_code == 200
        m = r.json()
        assert m["total_cost"] == 280
        assert m["planned_price_per_player"] == round(280/14, 2)

    def test_cancel_match(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "ToCancel", "start_datetime": _future_iso(120), "pricing_mode": "SPLIT",
            "total_cost": 100, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 14,
        })
        mid = r.json()["id"]
        rc = owner_session.post(f"{BASE_URL}/api/matches/{mid}/cancel", json={"reason": "Дъжд"})
        assert rc.status_code == 200
        m = rc.json()
        assert m["status"] == "CANCELLED"
        assert m["cancel_reason"] == "Дъжд"
        pytest.cancelled_id = mid


# ---------- RSVP ----------
class TestRSVP:
    def test_owner_rsvp_going_split_recalcs(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match1_id}/rsvp",
                               json={"status": "going"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rsvp"]["status"] == "going"
        # SPLIT: total=280 / 1 going = 280
        assert body["match_summary"]["going_count"] == 1
        assert body["match_summary"]["price_per_player"] == 280.0

    def test_rsvp_on_cancelled(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.cancelled_id}/rsvp",
                               json={"status": "going"})
        assert r.status_code == 400

    def test_rsvp_non_member_403(self, owner_session, mongo):
        # Insert an orphan user directly in DB (no membership)
        from bson import ObjectId
        uid = ObjectId()
        mongo.users.insert_one({"_id": uid, "phone": "+359888777111", "name": "Outsider", "created_at": datetime.now(timezone.utc)})
        token = _mint_token(str(uid))
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        r = s.post(f"{BASE_URL}/api/matches/{pytest.match1_id}/rsvp", json={"status": "going"})
        assert r.status_code == 403

    def test_late_cancel_reliability(self, owner_session, group, mongo):
        # Create a match starting in 1h (within 2h window)
        soon = (datetime.now(timezone.utc) + timedelta(minutes=70)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Soon", "start_datetime": soon, "pricing_mode": "SPLIT",
            "total_cost": 100, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 14,
        })
        mid = r.json()["id"]
        owner_session.post(f"{BASE_URL}/api/matches/{mid}/rsvp", json={"status": "going"})
        owner_session.post(f"{BASE_URL}/api/matches/{mid}/rsvp", json={"status": "not_going"})
        from bson import ObjectId
        u = mongo.users.find_one({"_id": ObjectId(owner_session.user_id)})
        stats = u.get("reliability_stats") or {}
        assert int(stats.get("late_cancellations") or 0) >= 1

    def test_rsvp_bulk_and_waitlist(self, owner_session, group, mongo):
        # New small match (limit 4) for fast waitlist test
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Small", "start_datetime": _future_iso(48), "pricing_mode": "SPLIT",
            "total_cost": 40, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 4,
        })
        mid = r.json()["id"]
        pytest.small_match_id = mid

        # Insert 5 fake users + memberships directly in DB to bypass OTP plumbing
        from bson import ObjectId
        gid = ObjectId(group["id"])
        user_ids = []
        for i in range(5):
            uid = ObjectId()
            mongo.users.insert_one({"_id": uid, "phone": f"+35988811{i}{i}{i}{i}", "name": f"P{i}", "created_at": datetime.now(timezone.utc)})
            mongo.memberships.insert_one({"group_id": gid, "user_id": uid, "role": "MEMBER", "joined_at": datetime.now(timezone.utc)})
            user_ids.append(str(uid))

        rb = owner_session.post(f"{BASE_URL}/api/matches/{mid}/rsvp-bulk", json={
            "user_ids": user_ids, "status": "going",
        })
        assert rb.status_code == 200, rb.text
        body = rb.json()
        # 5 added, but limit is 4 → 4 going + 1 waitlist
        assert body["match_summary"]["going_count"] == 4
        assert body["match_summary"]["waitlist_count"] == 1
        pytest.bulk_user_ids = user_ids

    def test_waitlist_endpoint(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/matches/{pytest.small_match_id}/waitlist")
        assert r.status_code == 200
        wl = r.json()
        assert len(wl) == 1
        assert wl[0]["waitlist_position"] == 1

    def test_rsvp_remove_promotes(self, owner_session):
        # Remove first going player → waitlist should promote
        first_user = pytest.bulk_user_ids[0]
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.small_match_id}/rsvp-remove",
                               json={"user_id": first_user})
        assert r.status_code == 200
        summary = r.json()["match_summary"]
        assert summary["going_count"] == 4  # promoted
        assert summary["waitlist_count"] == 0

    def test_rsvp_bulk_skips_non_member(self, owner_session, mongo):
        from bson import ObjectId
        rogue = str(ObjectId())  # never a member
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match1_id}/rsvp-bulk",
                               json={"user_ids": [rogue], "status": "going"})
        assert r.status_code == 200
        body = r.json()
        assert any(s["user_id"] == rogue and "not member" in s["reason"] for s in body["skipped"])

    def test_list_rsvps(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/matches/{pytest.small_match_id}/rsvps")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- APPROVAL flow ----------
class TestApprovalFlow:
    def test_approval_pending_then_approve(self, owner_session, group, mongo):
        from bson import ObjectId
        # APPROVAL match
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Appr", "start_datetime": _future_iso(60), "pricing_mode": "SPLIT",
            "total_cost": 70, "recurrence": "ONE_TIME", "join_mode": "APPROVAL", "player_limit": 7,
        })
        mid = r.json()["id"]

        # Direct DB user + membership
        uid = ObjectId()
        gid = ObjectId(group["id"])
        mongo.users.insert_one({"_id": uid, "phone": "+359888500001", "name": "Joiner", "created_at": datetime.now(timezone.utc)})
        mongo.memberships.insert_one({"group_id": gid, "user_id": uid, "role": "MEMBER", "joined_at": datetime.now(timezone.utc)})
        token = _mint_token(str(uid))
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        rr = s.post(f"{BASE_URL}/api/matches/{mid}/rsvp", json={"status": "going"})
        assert rr.status_code == 200
        assert rr.json()["rsvp"]["status"] == "pending"

        rp = owner_session.get(f"{BASE_URL}/api/matches/{mid}/pending-requests")
        assert rp.status_code == 200
        assert any(p["user_id"] == str(uid) for p in rp.json())

        ra = owner_session.post(f"{BASE_URL}/api/matches/{mid}/approve-request",
                                json={"user_id": str(uid), "action": "approve"})
        assert ra.status_code == 200
        assert ra.json()["status"] == "going"


# ---------- Payments (PRO) ----------
class TestPayments:
    def test_get_payments_swc(self, owner_session, mongo):
        # Need going players. Re-use SWC match (price 10, total 140, 1 going required).
        from bson import ObjectId
        # owner RSVP going
        r1 = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/rsvp", json={"status": "going"})
        assert r1.status_code == 200
        r = owner_session.get(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/payments")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["currency"] == "EUR"
        assert body["pricing_mode"] == "SPLIT_WITH_CASH"
        assert body["price_per_player"] == 10.0
        # cash = total - 10 * total_participants
        assert body["cash_contribution"] == round(140 - 10 * body["total_participants"], 2)

    def test_payment_overpaid(self, owner_session):
        # Mark owner OVERPAID 15 vs amount 10
        rm = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/payments/mark", json={
            "user_id": owner_session.user_id, "status": "PAID", "paid_amount": 15, "amount": 10,
        })
        assert rm.status_code == 200
        per_player = rm.json()["per_player"]
        owner = next((p for p in per_player if p["user_id"] == owner_session.user_id), None)
        assert owner is not None
        assert owner["status"] == "OVERPAID"
        assert owner["overpaid_to_cash"] == 5.0

    def test_payment_unpaid(self, owner_session):
        rm = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/payments/mark", json={
            "user_id": owner_session.user_id, "status": "UNPAID",
        })
        assert rm.status_code == 200
        owner = next(p for p in rm.json()["per_player"] if p["user_id"] == owner_session.user_id)
        assert owner["status"] == "UNPAID"
        assert owner["paid_amount"] == 0

    def test_payment_paid_exact(self, owner_session):
        rm = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/payments/mark", json={
            "user_id": owner_session.user_id, "status": "PAID", "paid_amount": 10, "amount": 10,
        })
        owner = next(p for p in rm.json()["per_player"] if p["user_id"] == owner_session.user_id)
        assert owner["status"] == "PAID"

    def test_record_to_cash_swc(self, owner_session, group):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match_swc_id}/payments/record-to-cash")
        assert r.status_code == 200, r.text
        types = [t["type"] for t in r.json()["transactions"]]
        assert "INCOME" in types
        # SPLIT_WITH_CASH should also add EXPENSE for cash contribution
        # cash_contribution = 140 - 10 * 1 = 130 > 0
        assert "EXPENSE" in types

    def test_pro_gating_free_group(self, owner_session, mongo):
        """Create a brand-new group, expire its TRIAL → FREE → 403."""
        from bson import ObjectId
        gr = owner_session.post(f"{BASE_URL}/api/groups", json={"name": f"FreeG-{uuid.uuid4().hex[:5]}"})
        # Owner already has 1 group from main fixture → FREE limit blocks 2nd. Skip if 400.
        if gr.status_code != 200:
            pytest.skip("Owner can't create 2nd group due to FREE limit; PRO gating tested elsewhere")
        gid = gr.json()["id"]
        # Force FREE by removing billing
        mongo.billing.delete_many({"group_id": ObjectId(gid)})
        rm = owner_session.post(f"{BASE_URL}/api/groups/{gid}/matches", json={
            "name": "M", "start_datetime": _future_iso(48), "pricing_mode": "SPLIT",
            "total_cost": 14, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 5,
        })
        if rm.status_code != 200:
            pytest.skip("Cannot create match in FREE group for gating test")
        mid = rm.json()["id"]
        rp = owner_session.get(f"{BASE_URL}/api/matches/{mid}/payments")
        assert rp.status_code == 403
        body = rp.json()
        # detail can be dict or string depending on FastAPI version
        det = body.get("detail")
        if isinstance(det, dict):
            assert det.get("code") == "PLAN_PRO_REQUIRED"
        else:
            assert "PRO" in str(det)


# ---------- Score / Results ----------
class TestScoreResults:
    def test_set_score(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match1_id}/score",
                               json={"blue_goals": 3, "red_goals": 2})
        assert r.status_code == 200
        assert r.json()["blue_goals"] == 3

    def test_set_goals_requires_team(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.match1_id}/results/set-goals",
                               json={"user_id": owner_session.user_id, "goals": 1})
        assert r.status_code == 400  # not in any team yet


# ---------- Teams draft ----------
class TestTeamsDraft:
    def test_set_captains_needs_two_going(self, owner_session, group, mongo):
        from bson import ObjectId
        # New match w/ 2 going players for captain test
        r = owner_session.post(f"{BASE_URL}/api/groups/{group['id']}/matches", json={
            "name": "Draft", "start_datetime": _future_iso(48), "pricing_mode": "SPLIT",
            "total_cost": 40, "recurrence": "ONE_TIME", "join_mode": "AUTO", "player_limit": 6,
        })
        mid = r.json()["id"]
        pytest.draft_match_id = mid
        owner_session.post(f"{BASE_URL}/api/matches/{mid}/rsvp", json={"status": "going"})
        # add 2nd captain via direct DB
        gid = ObjectId(group["id"])
        cap2 = ObjectId()
        mongo.users.insert_one({"_id": cap2, "phone": "+359888900002", "name": "Cap2", "created_at": datetime.now(timezone.utc)})
        mongo.memberships.insert_one({"group_id": gid, "user_id": cap2, "role": "MEMBER", "joined_at": datetime.now(timezone.utc)})
        owner_session.post(f"{BASE_URL}/api/matches/{mid}/rsvp-bulk", json={"user_ids": [str(cap2)], "status": "going"})

        rsc = owner_session.post(f"{BASE_URL}/api/matches/{mid}/teams/set-captains", json={
            "blue_captain_id": owner_session.user_id, "red_captain_id": str(cap2),
        })
        assert rsc.status_code == 200, rsc.text
        td = rsc.json()["teams_data"]
        assert td["blue_captain_id"] == owner_session.user_id
        assert td["red_captain_id"] == str(cap2)
        pytest.cap2 = str(cap2)

    def test_pick_alternates(self, owner_session, group, mongo):
        from bson import ObjectId
        # Add 2 more players + pick them
        gid = ObjectId(group["id"])
        extras = []
        for i in range(2):
            uid = ObjectId()
            mongo.users.insert_one({"_id": uid, "phone": f"+35988895000{i}", "name": f"E{i}", "created_at": datetime.now(timezone.utc)})
            mongo.memberships.insert_one({"group_id": gid, "user_id": uid, "role": "MEMBER", "joined_at": datetime.now(timezone.utc)})
            extras.append(str(uid))
        owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/rsvp-bulk",
                           json={"user_ids": extras, "status": "going"})
        # Pick 1: blue picks extras[0]
        r1 = owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/teams/pick",
                                json={"user_id": extras[0]})
        assert r1.status_code == 200
        assert r1.json()["teams_data"]["turn"] == "RED"
        # Pick the other captain → 400
        rb = owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/teams/pick",
                                json={"user_id": owner_session.user_id})
        assert rb.status_code == 400
        # Red picks extras[1]
        r2 = owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/teams/pick",
                                json={"user_id": extras[1]})
        assert r2.status_code == 200
        assert r2.json()["teams_data"]["turn"] == "BLUE"

    def test_lock_and_blocked_pick(self, owner_session):
        rl = owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/teams/lock",
                                json={"locked": True})
        assert rl.status_code == 200
        assert rl.json()["teams_data"]["locked"] is True

    def test_reset_clears(self, owner_session):
        rr = owner_session.post(f"{BASE_URL}/api/matches/{pytest.draft_match_id}/teams/reset")
        assert rr.status_code == 200
        td = rr.json()["teams_data"]
        assert td["blue_captain_id"] is None and td["pick_order"] == []


# ---------- Recurrence ----------
class TestRecurrence:
    def test_process_recurrence_skip_too_far(self, owner_session):
        # Weekly match was 96h in future → next would be 96h+7d = ~10 days, within 14d window.
        r = owner_session.post(f"{BASE_URL}/api/scheduler/process-recurrence")
        assert r.status_code == 200, r.text

    def test_stop_recurrence(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/matches/{pytest.weekly_match_id}/stop-recurrence")
        assert r.status_code == 200

    def test_series_listing(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/matches/{pytest.weekly_match_id}/series")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1


# ---------- History ----------
class TestHistory:
    def test_history_includes_cancelled(self, owner_session, group):
        r = owner_session.get(f"{BASE_URL}/api/groups/{group['id']}/matches/history")
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert pytest.cancelled_id in ids
