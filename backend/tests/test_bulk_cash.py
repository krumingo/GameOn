"""Tests for POST /api/groups/{gid}/cash/transactions/bulk (feature/bulk-01-backend).

Covers:
1. Happy path — 3 entries with different amounts → all created, totals correct,
   paid_by_user_id populated, counterparty resolved, bulk_collection_id shared.
2. Non-member user_id → 400 + no transactions created (atomicity).
3. Non-existent / inactive category → 400.
4. Admin-only → regular member → 403.
5. amount <= 0 → 400.
6. Existing single-create endpoint untouched (smoke test backwards compat).
"""
from __future__ import annotations

import os
import pytest
import requests

DIT2026 = os.environ.get("TEST_DIT_GROUP_ID", "69ee4e4914834e35eac85c99")  # PRO/TRIAL


# ---------- helpers ----------
def _find_two_members(base_url: str, super_client, gid: str):
    """Return 3 distinct member user_ids (OWNER + 2 MEMBERs) from the PRO group."""
    r = super_client.get(f"{base_url}/api/groups/{gid}")
    assert r.status_code == 200, r.text
    members = [m for m in (r.json().get("members_list") or []) if not m.get("is_guest")]
    assert len(members) >= 3, "Seed needs at least 3 non-guest members in DIT2026"
    return [m["user_id"] for m in members[:3]]


@pytest.fixture
def member_token(base_url, client):
    """Login as seeded member Иван (+359888100001) using dev OTP."""
    client.post(f"{base_url}/api/dev/seed-demo-data", timeout=30)
    phone = "+359888100001"
    client.post(f"{base_url}/api/auth/start", json={"phone": phone})
    r = client.post(f"{base_url}/api/auth/verify", json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("user_exists"), "Seeded member Иван not found"
    return data["token"]


@pytest.fixture
def member_client(client, member_token):
    client.headers.update({"Authorization": f"Bearer {member_token}"})
    return client


# ---------- bulk endpoint tests ----------
class TestBulkCashTransactions:
    def test_bulk_creates_multiple_transactions(self, base_url, super_client):
        """Happy path — 3 entries with distinct amounts and user_ids."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        payload = {
            "type": "INCOME",
            "category": "BANQUET",
            "note": "Банкет 22 март (bulk test)",
            "entries": [
                {"user_id": uids[0], "amount": 8.0},
                {"user_id": uids[1], "amount": 10.0},
                {"user_id": uids[2], "amount": 5.5},
            ],
        }
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json=payload,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created_count"] == 3
        assert body["total_amount"] == 23.5
        assert body["category"] == "BANQUET"
        assert body["type"] == "INCOME"
        assert body["bulk_collection_id"]
        bulk_id = body["bulk_collection_id"]

        # Verify via GET that each transaction has proper paid_by_user_id + counterparty
        listing = super_client.get(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=50",
        ).json()
        mine = [t for t in listing["transactions"] if t.get("bulk_collection_id") == bulk_id]
        assert len(mine) == 3
        uids_seen = {t["paid_by_user_id"] for t in mine}
        assert uids_seen == set(uids), f"paid_by_user_id mismatch: {uids_seen} vs {uids}"
        for t in mine:
            assert t["category"] == "BANQUET"
            assert t["type"] == "INCOME"
            assert t["status"] == "PAID"
            assert t["counterparty"], "counterparty should resolve to member name"
            assert t["paid_at"] is not None
        # Cleanup: delete bulk txns so subsequent test runs start clean
        for t in mine:
            super_client.delete(
                f"{base_url}/api/groups/{DIT2026}/cash/transactions/{t['id']}"
            )

    def test_bulk_validates_members_only(self, base_url, super_client):
        """Non-member user_id → 400, no partial inserts."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        # Count baseline
        before = super_client.get(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=500"
        ).json()["total_count"]
        payload = {
            "type": "INCOME",
            "category": "BANQUET",
            "entries": [
                {"user_id": uids[0], "amount": 1.0},
                # valid-looking but NOT a member of this group
                {"user_id": "60a0000000000000000000aa", "amount": 2.0},
            ],
        }
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json=payload,
        )
        assert r.status_code == 400
        assert "не е член" in r.text or "member" in r.text.lower()
        after = super_client.get(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=500"
        ).json()["total_count"]
        assert before == after, "Atomicity violation — partial inserts happened"

    def test_bulk_validates_category(self, base_url, super_client):
        """Unknown category → 400."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        payload = {
            "type": "INCOME",
            "category": "NOT_A_REAL_CATEGORY",
            "entries": [{"user_id": uids[0], "amount": 1.0}],
        }
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json=payload,
        )
        assert r.status_code == 400
        assert "Невалидна категория" in r.text or "category" in r.text.lower()

    def test_bulk_supports_different_amounts(self, base_url, super_client):
        """Each entry keeps its own amount; counterparty resolved per entry."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        amounts = [8.0, 10.0, 5.5]
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json={
                "type": "INCOME",
                "category": "BANQUET",
                "note": "diff amounts",
                "entries": [
                    {"user_id": uids[i], "amount": amounts[i]}
                    for i in range(3)
                ],
            },
        )
        assert r.status_code == 200
        bulk_id = r.json()["bulk_collection_id"]
        txns = [
            t for t in super_client.get(
                f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=50"
            ).json()["transactions"]
            if t.get("bulk_collection_id") == bulk_id
        ]
        assert len(txns) == 3
        by_uid = {t["paid_by_user_id"]: t for t in txns}
        for i, uid in enumerate(uids):
            assert by_uid[uid]["amount"] == amounts[i], \
                f"amount drift for {uid}: expected {amounts[i]}, got {by_uid[uid]['amount']}"
            assert by_uid[uid]["counterparty"], "counterparty missing"
        # Cleanup
        for t in txns:
            super_client.delete(
                f"{base_url}/api/groups/{DIT2026}/cash/transactions/{t['id']}"
            )

    def test_bulk_only_admin(self, base_url, super_client, member_client):
        """Regular MEMBER (Иван) cannot call bulk endpoint."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        payload = {
            "type": "INCOME",
            "category": "BANQUET",
            "entries": [{"user_id": uids[0], "amount": 1.0}],
        }
        r = member_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json=payload,
        )
        # require_admin raises 403
        assert r.status_code == 403, r.text

    def test_bulk_amount_must_be_positive(self, base_url, super_client):
        """Entry with amount <= 0 → 400, no inserts."""
        uids = _find_two_members(base_url, super_client, DIT2026)
        before = super_client.get(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=500"
        ).json()["total_count"]
        payload = {
            "type": "INCOME",
            "category": "BANQUET",
            "entries": [
                {"user_id": uids[0], "amount": 5.0},
                {"user_id": uids[1], "amount": 0},  # invalid
            ],
        }
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/bulk",
            json=payload,
        )
        assert r.status_code == 400
        after = super_client.get(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions?limit=500"
        ).json()["total_count"]
        assert before == after, "Atomicity violation on invalid amount"

    def test_single_create_endpoint_still_works(self, base_url, super_client):
        """Regression: existing POST /cash/transactions unchanged."""
        payload = {
            "type": "INCOME",
            "category": "BANQUET",
            "amount": 42.0,
            "note": "single-create smoke",
        }
        r = super_client.post(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions",
            json=payload,
        )
        assert r.status_code == 200
        tx = r.json()
        assert tx["amount"] == 42.0
        assert tx["category"] == "BANQUET"
        # New fields should appear as None / absent for single-create
        assert tx.get("paid_by_user_id") is None
        assert tx.get("bulk_collection_id") is None
        # Cleanup
        super_client.delete(
            f"{base_url}/api/groups/{DIT2026}/cash/transactions/{tx['id']}"
        )
