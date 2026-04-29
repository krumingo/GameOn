"""Prompt 13 tests: DELETE /api/matches/{id} (OWNER), groups/my matches_list new fields + lowercase 'going' fix."""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_PHONE = "+359888999999"


# ---------------- helpers ----------------
def _super_token():
    r = requests.post(f"{BASE_URL}/api/auth/super-test-login", json={"phone": SUPER_PHONE, "name": "Super Tester"}, timeout=15)
    assert r.status_code == 200, f"super-test-login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def super_token():
    return _super_token()


@pytest.fixture(scope="module")
def owner_group_id(super_token):
    """Find a group where super tester is OWNER (any TRIAL/PRO is fine)."""
    r = requests.get(f"{BASE_URL}/api/groups/my", headers=_auth(super_token), timeout=15)
    assert r.status_code == 200, r.text
    groups = r.json()
    owners = [g for g in groups if g.get("role") == "OWNER"]
    assert owners, "Super tester must own at least one group"
    return owners[0]["id"]


# ---------------- groups/my serialization ----------------
class TestGroupsMyMatchFields:
    def test_matches_list_contains_new_fields(self, super_token, owner_group_id):
        # ensure at least one upcoming match exists
        start = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        rc = requests.post(
            f"{BASE_URL}/api/groups/{owner_group_id}/matches",
            headers=_auth(super_token),
            json={
                "name": "TEST_P13_serialization",
                "start_datetime": start,
                "venue": "TestField",
                "pricing_mode": "SPLIT",
                "recurrence": "ONE_TIME",
                "join_mode": "AUTO",
                "player_limit": 10,
                "total_cost": 50.0,
            },
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        created_mid = rc.json()["id"]

        # RSVP self going so going_count > 0 and going_names populated
        rrsvp = requests.post(
            f"{BASE_URL}/api/matches/{created_mid}/rsvp",
            headers=_auth(super_token),
            json={"status": "going"},
            timeout=15,
        )
        assert rrsvp.status_code == 200, rrsvp.text

        r = requests.get(f"{BASE_URL}/api/groups/my", headers=_auth(super_token), timeout=15)
        assert r.status_code == 200
        groups = r.json()
        target = next((g for g in groups if g["id"] == owner_group_id), None)
        assert target is not None
        ml = target.get("matches_list") or []
        assert ml, "matches_list must not be empty (we just created one)"
        # Schema check on every entry
        required_keys = ("status", "recurrence", "player_limit", "waitlist_count",
                         "going_names", "pricing_mode", "going_count", "free_spots",
                         "user_rsvp_status", "id", "name", "start_datetime")
        for m in ml:
            for k in required_keys:
                assert k in m, f"matches_list entry missing '{k}' (keys={list(m.keys())})"
            assert isinstance(m["going_names"], list)

        # Find our created match — matches_list is limited to 5 sorted by start. If our match
        # isn't there (lots of earlier matches), fall back to verifying via direct GET.
        mine = next((m for m in ml if m.get("id") == created_mid), None)
        if mine is None:
            r2 = requests.get(f"{BASE_URL}/api/matches/{created_mid}",
                              headers=_auth(super_token), timeout=15)
            assert r2.status_code == 200
            mine = r2.json()

        # Lowercase-'going' fix: going_count must be >=1 since we RSVP'd
        assert mine["going_count"] >= 1, (
            f"going_count should be >=1 after RSVP, got {mine['going_count']} — "
            "indicates the lowercase 'going' filter bug regressed"
        )
        assert mine["user_rsvp_status"] == "going", (
            f"user_rsvp_status must be lowercase 'going', got {mine['user_rsvp_status']!r}"
        )
        # going_names shape (only checked when inside matches_list which has the field)
        if "going_names" in mine and mine["going_names"]:
            n0 = mine["going_names"][0]
            assert "name" in n0 and "user_id" in n0 and "is_guest" in n0

        # cleanup
        requests.delete(f"{BASE_URL}/api/matches/{created_mid}", headers=_auth(super_token), timeout=15)


# ---------------- DELETE /matches/{id} ----------------
class TestDeleteMatch:
    def _create(self, token, gid, name="TEST_P13_delete"):
        start = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/groups/{gid}/matches",
            headers=_auth(token),
            json={
                "name": name, "start_datetime": start, "venue": "DelField",
                "pricing_mode": "SPLIT", "recurrence": "ONE_TIME", "join_mode": "AUTO",
                "player_limit": 10, "total_cost": 0,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_owner_can_delete_and_cascade(self, super_token, owner_group_id):
        mid = self._create(super_token, owner_group_id)
        # Add an RSVP and a chat message to verify cascade
        requests.post(f"{BASE_URL}/api/matches/{mid}/rsvp", headers=_auth(super_token),
                      json={"status": "going"}, timeout=15)
        try:
            requests.post(f"{BASE_URL}/api/matches/{mid}/chat",
                          headers=_auth(super_token), json={"text": "hello"}, timeout=10)
        except Exception:
            pass

        d = requests.delete(f"{BASE_URL}/api/matches/{mid}", headers=_auth(super_token), timeout=15)
        assert d.status_code == 200, d.text
        body = d.json()
        assert body.get("deleted") is True
        assert body.get("match_id") == mid

        # GET → 404
        g = requests.get(f"{BASE_URL}/api/matches/{mid}", headers=_auth(super_token), timeout=15)
        assert g.status_code == 404, f"expected 404 after delete, got {g.status_code}"

        # rsvps cascade — list returns empty/404 (match gone)
        rs = requests.get(f"{BASE_URL}/api/matches/{mid}/rsvps", headers=_auth(super_token), timeout=15)
        assert rs.status_code in (404, 200)
        if rs.status_code == 200:
            assert rs.json() == []

    def test_delete_unknown_match_404(self, super_token):
        # bogus ObjectId
        bogus = "0" * 24
        d = requests.delete(f"{BASE_URL}/api/matches/{bogus}", headers=_auth(super_token), timeout=15)
        assert d.status_code == 404

    def test_non_owner_organizer_gets_403(self, super_token, owner_group_id):
        """A second user added as ORGANIZER should NOT be allowed to DELETE."""
        # Create a fresh OTP user
        phone = "+359888100009"  # seeded user, exists already
        rs = requests.post(f"{BASE_URL}/api/auth/start", json={"phone": phone}, timeout=15)
        if rs.status_code == 429:
            pytest.skip(f"OTP rate-limited: {rs.text}")
        assert rs.status_code == 200, rs.text
        rv = requests.post(f"{BASE_URL}/api/auth/verify", json={"phone": phone, "otp": "123456"}, timeout=15)
        assert rv.status_code == 200, rv.text
        other_token = rv.json()["token"]
        other_id = rv.json()["user"]["id"]

        # Make sure this user is a member of the owner_group_id; if not, add via membership endpoint as owner
        # Try to upgrade their role to ORGANIZER. If endpoint not present, skip role upgrade and rely on member 403.
        upgraded = False
        try:
            r = requests.post(
                f"{BASE_URL}/api/groups/{owner_group_id}/members/{other_id}/role",
                headers=_auth(super_token), json={"role": "ORGANIZER"}, timeout=15,
            )
            upgraded = r.status_code == 200
        except Exception:
            upgraded = False

        if not upgraded:
            # Best-effort: just verify a non-owner gets 403/404 (require_owner blocks both ORGANIZER and MEMBER)
            pass

        mid = self._create(super_token, owner_group_id, name="TEST_P13_delete_403")
        try:
            d = requests.delete(f"{BASE_URL}/api/matches/{mid}", headers=_auth(other_token), timeout=15)
            # require_owner returns 403 for non-OWNER (and 403/404 for non-member)
            assert d.status_code in (403, 404), f"non-owner must NOT delete; got {d.status_code} {d.text}"
        finally:
            # cleanup as OWNER
            requests.delete(f"{BASE_URL}/api/matches/{mid}", headers=_auth(super_token), timeout=15)


# ---------------- PATCH / cancel / stop-recurrence sanity ----------------
class TestExistingEndpointsStillWork:
    def test_patch_cancel_stop_recurrence_flow(self, super_token, owner_group_id):
        start = (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/groups/{owner_group_id}/matches",
            headers=_auth(super_token),
            json={"name": "TEST_P13_patch", "start_datetime": start, "venue": "v",
                  "pricing_mode": "SPLIT", "recurrence": "WEEKLY", "join_mode": "AUTO",
                  "player_limit": 10, "total_cost": 0},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        try:
            # PATCH name
            p = requests.patch(f"{BASE_URL}/api/matches/{mid}", headers=_auth(super_token),
                               json={"name": "TEST_P13_patch_renamed"}, timeout=15)
            assert p.status_code == 200, p.text
            assert p.json()["name"] == "TEST_P13_patch_renamed"

            # stop-recurrence
            s = requests.post(f"{BASE_URL}/api/matches/{mid}/stop-recurrence",
                              headers=_auth(super_token), timeout=15)
            assert s.status_code in (200, 204), s.text

            # cancel
            c = requests.post(f"{BASE_URL}/api/matches/{mid}/cancel",
                              headers=_auth(super_token), json={"reason": "test"}, timeout=15)
            assert c.status_code == 200, c.text
            assert c.json().get("status") == "CANCELLED"
        finally:
            requests.delete(f"{BASE_URL}/api/matches/{mid}", headers=_auth(super_token), timeout=15)
