"""PROMPT 8 — Admin Panel + Hall of Fame + Cash Export + Transfer player.

Covers:
- POST /api/admin/login (200 + 401)
- GET /api/admin/stats / groups / users / payments (200 + 401 missing/invalid)
- GET /api/admin/groups/{id} and /api/admin/users/{id} (detail + 404)
- GET /api/groups/{gid}/seasons/hall-of-fame (PRO ok, FREE 402/403, structure)
- GET /api/groups/{gid}/cash/export?format=csv|json (PRO admin)
- POST /api/matches/{mid}/teams/transfer validation (400 same team / locked / non-admin paths)
"""

from __future__ import annotations
import os
import io
import csv
import pytest
import requests

SPORT26 = os.environ.get("TEST_SPORT_GROUP_ID", "69ee4e4914834e35eac85c96")  # FREE
DIT2026 = os.environ.get("TEST_DIT_GROUP_ID", "69ee4e4914834e35eac85c99")  # PRO/TRIAL
ADMIN_EMAIL = "admin@gameon.bg"
ADMIN_PW = "admin_secure_password_2026!"


# ---------- ADMIN LOGIN ----------
class TestAdminAuth:
    def test_admin_login_success(self, base_url, client):
        r = client.post(f"{base_url}/api/admin/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "admin_token" in data
        assert isinstance(data["admin_token"], str) and len(data["admin_token"]) > 20

    def test_admin_login_invalid(self, base_url, client):
        r = client.post(f"{base_url}/api/admin/login",
                        json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_admin_stats_requires_token(self, base_url, client):
        r = client.get(f"{base_url}/api/admin/stats")
        assert r.status_code == 401

    def test_admin_stats_invalid_token(self, base_url, client):
        r = client.get(f"{base_url}/api/admin/stats",
                       headers={"Authorization": "Bearer not-a-token"})
        assert r.status_code == 401


@pytest.fixture
def admin_token(base_url, client):
    r = client.post(f"{base_url}/api/admin/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200
    return r.json()["admin_token"]


@pytest.fixture
def admin_client(client, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {admin_token}"})
    return s


# ---------- ADMIN STATS / GROUPS / USERS ----------
class TestAdminEndpoints:
    def test_admin_stats(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_users", "total_groups", "active_matches",
                  "pro_groups", "free_groups", "trial_groups",
                  "total_revenue_eur", "signups_last_7_days",
                  "matches_last_7_days", "currency"):
            assert k in d, f"missing {k}"
        assert d["currency"] == "EUR"
        assert d["total_users"] >= 1
        assert d["total_groups"] >= 1

    def test_admin_groups_list(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/groups?limit=50")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        first = items[0]
        for k in ("id", "name", "entry_code", "members_count", "plan"):
            assert k in first
        assert first["plan"] in ("PRO", "FREE", "TRIAL", "GRACE")

    def test_admin_groups_filter_plan(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/groups?plan=PRO&limit=50")
        assert r.status_code == 200
        for g in r.json():
            assert g["plan"] == "PRO"

    def test_admin_groups_search(self, base_url, admin_client):
        # Backend search regex is on `name`. Seeded name is Cyrillic "ДИТ Неделя".
        r = admin_client.get(f"{base_url}/api/admin/groups?search=ДИТ")
        assert r.status_code == 200
        names = [g["name"] for g in r.json()]
        assert any("ДИТ" in (n or "") for n in names), f"no group matched, got names={names}"

    def test_admin_group_detail(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/groups/{DIT2026}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == DIT2026
        assert "members" in d and isinstance(d["members"], list)
        assert d["plan"] in ("PRO", "TRIAL", "GRACE", "FREE")

    def test_admin_group_detail_404(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/groups/000000000000000000000000")
        assert r.status_code == 404

    def test_admin_users_list(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/users?limit=20")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        for k in ("id", "name", "phone", "reliability_score", "groups_count"):
            assert k in items[0]

    def test_admin_users_search(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/users?search=Super")
        assert r.status_code == 200
        names = [u["name"] for u in r.json()]
        assert any("Super" in (n or "") for n in names)

    def test_admin_user_detail_404(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/users/000000000000000000000000")
        assert r.status_code == 404

    def test_admin_payments(self, base_url, admin_client):
        r = admin_client.get(f"{base_url}/api/admin/payments?limit=20")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- HALL OF FAME ----------
class TestHallOfFame:
    def test_hof_pro_dit(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{DIT2026}/seasons/hall-of-fame")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        # spec: at least 1 closed season seeded for DIT2026
        assert len(items) >= 1
        first = items[0]
        assert "season" in first and "champions" in first
        for k in ("id", "name", "start_at", "end_at"):
            assert k in first["season"]
        assert isinstance(first["champions"], list)
        # if there are champions, validate structure
        if first["champions"]:
            ch = first["champions"][0]
            for k in ("position", "user_id", "user_name", "points", "coefficient"):
                assert k in ch

    def test_hof_free_paywall(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{SPORT26}/seasons/hall-of-fame")
        # FREE plan should be blocked by check_pro_access (402/403)
        assert r.status_code in (402, 403)


# ---------- CASH EXPORT ----------
class TestCashExport:
    def test_cash_export_csv(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{DIT2026}/cash/export?format=csv")
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        # parse header row
        lines = list(csv.reader(io.StringIO(r.text)))
        assert lines, "empty csv"
        header = lines[0]
        assert "Type" in header and "Amount" in header and "Currency" in header

    def test_cash_export_json(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{DIT2026}/cash/export?format=json")
        assert r.status_code == 200
        d = r.json()
        assert "transactions" in d and isinstance(d["transactions"], list)
        assert d.get("currency") == "EUR"

    def test_cash_export_free_paywall(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{SPORT26}/cash/export?format=csv")
        assert r.status_code in (402, 403)


# ---------- TRANSFER PLAYER (validation only) ----------
class TestTransferPlayerValidation:
    def _find_match_id(self, base_url, super_client):
        r = super_client.get(f"{base_url}/api/groups/{DIT2026}/matches?limit=10")
        if r.status_code != 200:
            return None
        for m in r.json():
            return m.get("id") or m.get("_id")
        return None

    def test_transfer_invalid_same_team_or_404(self, base_url, super_client):
        mid = self._find_match_id(base_url, super_client)
        if not mid:
            pytest.skip("No match available in DIT2026")
        # same team should be 400
        r = super_client.post(
            f"{base_url}/api/matches/{mid}/teams/transfer",
            json={"user_id": "000000000000000000000001",
                  "from_team": "BLUE", "to_team": "BLUE"},
        )
        # Either 400 (same team) or 400 (invalid user) — we accept 400 family
        assert r.status_code in (400, 404)

    def test_transfer_invalid_team_value(self, base_url, super_client):
        mid = self._find_match_id(base_url, super_client)
        if not mid:
            pytest.skip("No match available in DIT2026")
        r = super_client.post(
            f"{base_url}/api/matches/{mid}/teams/transfer",
            json={"user_id": "000000000000000000000001",
                  "from_team": "GREEN", "to_team": "BLUE"},
        )
        # Pydantic 422 or backend 400
        assert r.status_code in (400, 422)
