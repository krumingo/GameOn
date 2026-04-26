"""End-to-end backend tests for FootBallChat.

Covers:
- Health
- OTP auth (start/verify, rate limit, cooldown, dev fallback)
- Super-test-login + /api/me GET/PATCH (id, not _id)
- Groups CRUD, FREE plan limit, public, preview-by-code, points_config, categories
- Memberships: add, remove, role change, guests, guest merge on /auth/join
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Direct mongo client (used to seed/reset OTP rate-limit and cooldown)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "footballchat")
_mongo = MongoClient(MONGO_URL)
_mdb = _mongo[DB_NAME]


def _wipe_otp(phone: str):
    _mdb.otp_codes.delete_many({"phone": phone})


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------
class TestHealth:
    def test_health_ok(self, client, base_url):
        r = client.get(f"{base_url}/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body.get("currency") == "EUR"


# ------------------------------------------------------------------
# Auth - OTP start / verify
# ------------------------------------------------------------------
class TestAuthOTP:
    def test_auth_start_invalid_phone_no_plus(self, client, base_url):
        r = client.post(f"{base_url}/api/auth/start", json={"phone": "359888111111"})
        assert r.status_code == 400

    def test_auth_start_valid(self, client, base_url):
        phone = "+359888111111"
        _wipe_otp(phone)
        r = client.post(f"{base_url}/api/auth/start", json={"phone": phone})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("dev_mode") is True

    def test_resend_cooldown_60s(self, client, base_url):
        phone = "+359888222222"
        _wipe_otp(phone)
        r1 = client.post(f"{base_url}/api/auth/start", json={"phone": phone})
        assert r1.status_code == 200
        r2 = client.post(f"{base_url}/api/auth/start", json={"phone": phone})
        assert r2.status_code == 429, r2.text

    def test_rate_limit_5_per_hour(self, client, base_url):
        phone = "+359888333333"
        _wipe_otp(phone)
        # Pre-seed 5 OTPs created within last hour to bypass cooldown but trigger rate-limit
        now = datetime.now(timezone.utc)
        for i in range(5):
            _mdb.otp_codes.insert_one({
                "phone": phone,
                "code": "000000",
                "expires_at": now + timedelta(minutes=5),
                "used": True,
                # Stagger created_at outside the 60s cooldown window
                "created_at": now - timedelta(minutes=10 + i),
            })
        r = client.post(f"{base_url}/api/auth/start", json={"phone": phone})
        assert r.status_code == 429, r.text

    def test_verify_with_dev_otp_new_user(self, client, base_url):
        phone = "+359888444444"
        _wipe_otp(phone)
        # Ensure user doesn't exist
        _mdb.users.delete_many({"phone": phone})
        r = client.post(f"{base_url}/api/auth/verify",
                        json={"phone": phone, "otp": "123456"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["verified"] is True
        assert body["user_exists"] is False
        assert body["phone"] == phone

    def test_verify_wrong_otp(self, client, base_url):
        phone = "+359888555555"
        _wipe_otp(phone)
        r = client.post(f"{base_url}/api/auth/verify",
                        json={"phone": phone, "otp": "999999"})
        assert r.status_code == 400


# ------------------------------------------------------------------
# Super test login + /api/me
# ------------------------------------------------------------------
class TestMe:
    def test_super_test_login(self, client, base_url):
        r = client.post(f"{base_url}/api/auth/super-test-login")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        u = body["user"]
        assert u["reliability_score"] == 100
        assert "id" in u
        assert "_id" not in u

    def test_get_me_returns_id_not_underscore(self, super_client, base_url):
        r = super_client.get(f"{base_url}/api/me")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body
        assert "_id" not in body
        assert body["reliability_score"] == 100
        assert "reliability_stats" in body

    def test_patch_me_updates_nickname_email(self, super_client, base_url):
        nick = f"nick_{uuid.uuid4().hex[:6]}"
        email = f"{nick}@test.com"
        r = super_client.patch(f"{base_url}/api/me",
                               json={"nickname": nick, "email": email})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["nickname"] == nick
        assert body["email"] == email
        assert "id" in body and "_id" not in body

    def test_me_requires_auth(self, client, base_url):
        r = client.get(f"{base_url}/api/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, client, base_url):
        r = client.get(f"{base_url}/api/me",
                       headers={"Authorization": "Bearer not.a.token"})
        assert r.status_code == 401


# ------------------------------------------------------------------
# Groups: create, FREE limit, my, public, preview-by-code, get, update
# ------------------------------------------------------------------
@pytest.fixture(scope="module")
def owner_state():
    """Persist state across the group tests in this module."""
    return {}


class TestGroups:
    @pytest.fixture(autouse=True)
    def _setup_owner(self, owner_state, client):
        # Use a fresh user as OWNER for these tests to isolate from super tester
        if "token" not in owner_state:
            phone = "+359888100100"
            _mdb.users.delete_many({"phone": phone})
            _mdb.memberships.delete_many({})
            _mdb.groups.delete_many({})
            _mdb.billing.delete_many({})
            _mdb.guests.delete_many({})
            _wipe_otp(phone)
            # Create user via verify (returns user_exists=False) then via /auth/join? Easier: insert via Mongo, then login via super endpoint won't help (different phone)
            # Use auth/start + verify will only return verified, not create user. We need a path to create real user.
            # Simplest: insert directly + create token via super-test-login won't work. So manually login this user via DB insert + verify won't give token.
            # Instead, use /api/auth/join with a temporary group? No group exists yet.
            # Easiest workaround: insert user in DB and call super-test-login wrapper? It only logs in +359888999999.
            # We'll insert user in DB and create JWT ourselves using the same JWT_SECRET.
            import jwt
            now = datetime.now(timezone.utc)
            res = _mdb.users.insert_one({
                "name": "Owner Tester",
                "phone": phone,
                "reliability_score": 100,
                "reliability_stats": {"total_rsvp_going": 0, "total_attended": 0, "late_cancellations": 0},
                "created_at": now,
            })
            uid = str(res.inserted_id)
            secret = os.environ.get("JWT_SECRET")
            assert secret, "JWT_SECRET must be set in env"
            token = jwt.encode(
                {"sub": uid, "iat": int(now.timestamp()),
                 "exp": int((now + timedelta(days=1)).timestamp())},
                secret, algorithm="HS256",
            )
            owner_state["token"] = token
            owner_state["user_id"] = uid
            owner_state["phone"] = phone
        client.headers.update({"Authorization": f"Bearer {owner_state['token']}"})

    def test_a_create_group(self, client, base_url, owner_state):
        payload = {
            "name": "Test FC",
            "venue": "Stadium A",
            "location": {"lat": 42.68, "lng": 23.35, "address": "Sofia"},
        }
        r = client.post(f"{base_url}/api/groups", json=payload)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["name"] == "Test FC"
        assert g["currency"] == "EUR"
        assert g["plan"] == "TRIAL"
        assert 13 <= (g["trial_days_left"] or 0) <= 14
        assert g["points_config"] == {"win": 3, "draw": 1, "loss": 0}
        assert isinstance(g["cash_categories"], list) and len(g["cash_categories"]) == 7
        assert "MATCH_FEES" in g["cash_categories"]
        assert g["entry_code"] and len(g["entry_code"]) == 6
        owner_state["group_id"] = g["id"]
        owner_state["entry_code"] = g["entry_code"]

    def test_b_create_second_group_blocked(self, client, base_url):
        r = client.post(f"{base_url}/api/groups", json={"name": "Second"})
        assert r.status_code == 400, r.text
        assert "FREE" in r.json().get("detail", "")

    def test_c_my_groups(self, client, base_url, owner_state):
        r = client.get(f"{base_url}/api/groups/my")
        assert r.status_code == 200, r.text
        arr = r.json()
        assert len(arr) >= 1
        g = next((x for x in arr if x["id"] == owner_state["group_id"]), None)
        assert g is not None
        assert g["role"] == "OWNER"
        assert g["members_count"] == 1
        assert g["matches_list"] == []
        assert g["plan"] == "TRIAL"

    def test_d_public_groups_geo(self, client, base_url, owner_state):
        # No auth required for this endpoint? Actually no decorator -> public.
        r = requests.get(f"{base_url}/api/groups/public",
                         params={"lat": 42.68, "lng": 23.35, "radius": 5000})
        assert r.status_code == 200, r.text
        arr = r.json()
        ids = [x["id"] for x in arr]
        assert owner_state["group_id"] in ids

    def test_e_preview_by_code_no_auth(self, base_url, owner_state):
        # Use bare requests (no auth)
        r = requests.get(f"{base_url}/api/groups/preview-by-code",
                        params={"code": owner_state["entry_code"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Test FC"
        assert body["members_count"] == 1
        assert "id" not in body  # preview must not leak full group info

    def test_e2_get_group_by_id_requires_auth(self, base_url, owner_state):
        r = requests.get(f"{base_url}/api/groups/{owner_state['group_id']}")
        assert r.status_code == 401

    def test_f_get_group_full(self, client, base_url, owner_state):
        r = client.get(f"{base_url}/api/groups/{owner_state['group_id']}")
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["id"] == owner_state["group_id"]
        assert isinstance(g.get("members_list"), list)
        assert len(g["members_list"]) == 1
        assert g["members_list"][0]["role"] == "OWNER"

    def test_g_patch_points_config(self, client, base_url, owner_state):
        r = client.patch(f"{base_url}/api/groups/{owner_state['group_id']}",
                         json={"points_config": {"win": 2, "draw": 1, "loss": 0}})
        assert r.status_code == 200, r.text
        assert r.json()["points_config"] == {"win": 2, "draw": 1, "loss": 0}
        # verify persisted via GET
        r2 = client.get(f"{base_url}/api/groups/{owner_state['group_id']}")
        assert r2.json()["points_config"] == {"win": 2, "draw": 1, "loss": 0}

    def test_h_patch_invalid_points_config(self, client, base_url, owner_state):
        r = client.patch(f"{base_url}/api/groups/{owner_state['group_id']}",
                         json={"points_config": {"win": -1, "draw": 1, "loss": 0}})
        assert r.status_code == 400

    def test_i_add_category(self, client, base_url, owner_state):
        r = client.post(f"{base_url}/api/groups/{owner_state['group_id']}/categories",
                        json={"category": "REFEREE"})
        assert r.status_code == 200, r.text
        assert "REFEREE" in r.json()["cash_categories"]

    def test_j_add_duplicate_category(self, client, base_url, owner_state):
        r = client.post(f"{base_url}/api/groups/{owner_state['group_id']}/categories",
                        json={"category": "REFEREE"})
        assert r.status_code == 400

    def test_k_deactivate_category(self, client, base_url, owner_state):
        r = client.delete(f"{base_url}/api/groups/{owner_state['group_id']}/categories/REFEREE")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "REFEREE" in body.get("inactive_categories", [])
        assert "REFEREE" in body.get("cash_categories", [])  # still in main list


# ------------------------------------------------------------------
# Memberships, guests, merge flow, role changes
# ------------------------------------------------------------------
class TestMembers:
    @pytest.fixture(autouse=True)
    def _setup(self, owner_state, client):
        client.headers.update({"Authorization": f"Bearer {owner_state['token']}"})

    def test_a_add_member_phone_not_found(self, client, base_url, owner_state):
        r = client.post(f"{base_url}/api/groups/{owner_state['group_id']}/members",
                        json={"phone": "+359888777777"})
        assert r.status_code == 404
        assert "не е намерен" in r.json().get("detail", "")

    def test_b_add_guest(self, client, base_url, owner_state):
        r = client.post(f"{base_url}/api/groups/{owner_state['group_id']}/guests",
                        json={"name": "Guest A", "phone": "+359888666666"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_guest"] is True
        assert body["name"] == "Guest A"
        owner_state["guest_id"] = body["id"]

    def test_c_list_members_includes_guest(self, client, base_url, owner_state):
        r = client.get(f"{base_url}/api/groups/{owner_state['group_id']}/members")
        assert r.status_code == 200
        arr = r.json()
        # Sort: OWNER first
        assert arr[0]["role"] == "OWNER"
        guest_ids = [x["id"] for x in arr if x.get("is_guest")]
        assert owner_state["guest_id"] in guest_ids
        # phone_masked present for OWNER
        assert "phone_masked" in arr[0]

    def test_d_guest_merge_via_auth_join(self, client, base_url, owner_state):
        """Register a user via /api/auth/join with same phone as guest -> guest must vanish."""
        guest_phone = "+359888666666"
        # Ensure user doesn't yet exist
        _mdb.users.delete_many({"phone": guest_phone})
        # In dev mode, auth/join works without otp
        r = requests.post(f"{base_url}/api/auth/join",
                          json={"name": "Real User",
                                "phone": guest_phone,
                                "entry_code": owner_state["entry_code"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body
        assert body["user"]["phone"] == guest_phone

        # Verify the guest is gone, and user is now MEMBER
        r2 = client.get(f"{base_url}/api/groups/{owner_state['group_id']}/members")
        arr = r2.json()
        guest_left = [x for x in arr if x.get("is_guest")]
        assert len(guest_left) == 0, f"Guest not removed: {guest_left}"
        member = next((x for x in arr if x.get("name") == "Real User"), None)
        assert member is not None
        assert member["role"] == "MEMBER"
        owner_state["member_id"] = member["id"]
        owner_state["member_user_id"] = member["user_id"]

    def test_e_change_role_to_organizer(self, client, base_url, owner_state):
        r = client.patch(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/"
            f"{owner_state['member_id']}/role",
            json={"role": "ORGANIZER"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "ORGANIZER"

    def test_f_cannot_change_owner_role(self, client, base_url, owner_state):
        # Find owner membership_id
        r = client.get(f"{base_url}/api/groups/{owner_state['group_id']}/members")
        owner = next(x for x in r.json() if x["role"] == "OWNER")
        r2 = client.patch(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/"
            f"{owner['id']}/role",
            json={"role": "MEMBER"})
        assert r2.status_code == 400

    def test_g_organizer_cannot_remove_organizer(self, client, base_url, owner_state):
        # Add a 2nd ORGANIZER (Real User2) as guest then merge
        # Easier: directly add another ORGANIZER via DB then test removal as the first organizer
        # Setup: insert a 2nd user; add membership as ORGANIZER
        from bson import ObjectId
        u2 = _mdb.users.insert_one({
            "name": "Org2",
            "phone": "+359888888001",
            "reliability_score": 100,
            "created_at": datetime.now(timezone.utc),
        }).inserted_id
        m2 = _mdb.memberships.insert_one({
            "group_id": ObjectId(owner_state["group_id"]),
            "user_id": u2,
            "role": "ORGANIZER",
            "joined_at": datetime.now(timezone.utc),
        }).inserted_id
        owner_state["org2_member_id"] = str(m2)
        owner_state["org2_user_id"] = str(u2)

        # Now act as ORGANIZER (the merged user) and try to remove ORGANIZER (org2)
        import jwt
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {"sub": owner_state["member_user_id"], "iat": int(now.timestamp()),
             "exp": int((now + timedelta(days=1)).timestamp())},
            os.environ["JWT_SECRET"], algorithm="HS256",
        )
        r = requests.delete(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/{owner_state['org2_member_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text

    def test_h_cannot_remove_owner(self, client, base_url, owner_state):
        r = client.get(f"{base_url}/api/groups/{owner_state['group_id']}/members")
        owner = next(x for x in r.json() if x["role"] == "OWNER")
        r2 = client.delete(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/{owner['id']}")
        assert r2.status_code == 400

    def test_i_remove_member(self, client, base_url, owner_state):
        # Demote ORGANIZER (real user) back to MEMBER first
        client.patch(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/"
            f"{owner_state['member_id']}/role",
            json={"role": "MEMBER"})
        r = client.delete(
            f"{base_url}/api/groups/{owner_state['group_id']}/members/{owner_state['member_id']}")
        assert r.status_code == 200, r.text
        assert r.json()["deleted"] is True

    def test_j_add_guest_then_remove(self, client, base_url, owner_state):
        r = client.post(f"{base_url}/api/groups/{owner_state['group_id']}/guests",
                        json={"name": "Tmp Guest"})
        assert r.status_code == 200
        gid = r.json()["id"]
        r2 = client.delete(f"{base_url}/api/groups/{owner_state['group_id']}/guests/{gid}")
        assert r2.status_code == 200
        assert r2.json()["deleted"] is True
