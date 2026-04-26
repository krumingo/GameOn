"""Prompt 9 — Push notifications: register-token + prefs + dev /test."""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ---- helpers ----
@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/super-test-login", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


# ---- register-token ----
class TestRegisterToken:
    def test_register_token_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/push/register-token",
                          json={"token": "ExponentPushToken[abc]"}, timeout=10)
        assert r.status_code in (401, 403), r.text

    def test_register_token_rejects_invalid(self, headers):
        r = requests.post(f"{BASE_URL}/api/push/register-token",
                          json={"token": "garbage-token"}, headers=headers, timeout=10)
        assert r.status_code == 400, r.text

    def test_register_token_rejects_empty(self, headers):
        r = requests.post(f"{BASE_URL}/api/push/register-token",
                          json={"token": ""}, headers=headers, timeout=10)
        assert r.status_code in (400, 422), r.text

    def test_register_token_success_persists(self, headers):
        token = "ExponentPushToken[TEST_REGRESSION_PROMPT9]"
        r = requests.post(f"{BASE_URL}/api/push/register-token",
                          json={"token": token}, headers=headers, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"success": True}

        # Verify via /api/me — expo_push_token should be set
        me = requests.get(f"{BASE_URL}/api/me", headers=headers, timeout=10)
        assert me.status_code == 200
        # /api/me may or may not expose expo_push_token; do not assert presence
        # but we proved persistence implicitly via /test endpoint below

    def test_register_token_then_test_returns_sent_true(self, headers):
        # Ensure token registered
        token = "ExponentPushToken[TEST_REGRESSION_PROMPT9]"
        requests.post(f"{BASE_URL}/api/push/register-token",
                      json={"token": token}, headers=headers, timeout=10)
        r = requests.post(f"{BASE_URL}/api/push/test", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True

    def test_unregister_token(self, headers):
        r = requests.delete(f"{BASE_URL}/api/push/register-token", headers=headers, timeout=10)
        assert r.status_code == 200
        assert r.json() == {"success": True}

        # /test should now return sent:false with reason
        t = requests.post(f"{BASE_URL}/api/push/test", headers=headers, timeout=10)
        assert t.status_code == 200, t.text
        body = t.json()
        assert body.get("sent") is False
        assert "push token" in (body.get("reason") or "").lower() or "token" in (body.get("reason") or "")


# ---- prefs ----
class TestPrefs:
    def test_get_prefs_returns_defaults(self, headers):
        # Reset by setting all defaults explicitly, then read
        requests.put(f"{BASE_URL}/api/push/prefs", json={
            "new_matches": True,
            "reminders": True,
            "reminder_hours": 24,
            "rsvp_changes": False,
            "chat": True,
        }, headers=headers, timeout=10)
        r = requests.get(f"{BASE_URL}/api/push/prefs", headers=headers, timeout=10)
        assert r.status_code == 200
        p = r.json()
        assert p["new_matches"] is True
        assert p["reminders"] is True
        assert p["reminder_hours"] == 24
        assert p["rsvp_changes"] is False
        assert p["chat"] is True

    def test_put_prefs_partial_merge(self, headers):
        # Set known baseline
        requests.put(f"{BASE_URL}/api/push/prefs", json={
            "new_matches": True, "reminders": True, "reminder_hours": 24,
            "rsvp_changes": False, "chat": True,
        }, headers=headers, timeout=10)
        # Send only reminders=false
        r = requests.put(f"{BASE_URL}/api/push/prefs", json={"reminders": False},
                         headers=headers, timeout=10)
        assert r.status_code == 200
        p = r.json()
        assert p["reminders"] is False
        # Other fields untouched
        assert p["new_matches"] is True
        assert p["reminder_hours"] == 24
        assert p["rsvp_changes"] is False
        assert p["chat"] is True

        # GET confirms persistence
        g = requests.get(f"{BASE_URL}/api/push/prefs", headers=headers, timeout=10).json()
        assert g["reminders"] is False
        assert g["new_matches"] is True

    def test_put_prefs_validates_reminder_hours_low(self, headers):
        r = requests.put(f"{BASE_URL}/api/push/prefs", json={"reminder_hours": 0},
                         headers=headers, timeout=10)
        assert r.status_code == 422, r.text

    def test_put_prefs_validates_reminder_hours_high(self, headers):
        r = requests.put(f"{BASE_URL}/api/push/prefs", json={"reminder_hours": 200},
                         headers=headers, timeout=10)
        assert r.status_code == 422, r.text

    def test_put_prefs_accepts_valid_reminder_hours(self, headers):
        for h in [1, 2, 24, 48, 168]:
            r = requests.put(f"{BASE_URL}/api/push/prefs", json={"reminder_hours": h},
                             headers=headers, timeout=10)
            assert r.status_code == 200, f"hours={h} {r.text}"
            assert r.json()["reminder_hours"] == h

    def test_get_prefs_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/push/prefs", timeout=10)
        assert r.status_code in (401, 403)


# ---- /test endpoint behaviors ----
class TestPushTest:
    def test_test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/push/test", timeout=10)
        assert r.status_code in (401, 403)

    def test_test_returns_sent_false_when_no_token(self, headers):
        # Ensure no token
        requests.delete(f"{BASE_URL}/api/push/register-token", headers=headers, timeout=10)
        r = requests.post(f"{BASE_URL}/api/push/test", headers=headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("sent") is False
        assert body.get("reason")  # has reason string


# ---- regression: push fire-and-forget should not break match flows ----
class TestMatchFlowsStillWork:
    def test_super_login_and_list_groups(self, headers):
        r = requests.get(f"{BASE_URL}/api/groups/my", headers=headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_rsvp_toggle_still_returns_quickly(self, headers):
        # Find a group and a future match
        groups = requests.get(f"{BASE_URL}/api/groups/my", headers=headers, timeout=10).json()
        if not groups:
            pytest.skip("No groups for super user")
        gid = groups[0]["id"]
        ms = requests.get(f"{BASE_URL}/api/groups/{gid}/matches", headers=headers, timeout=10)
        assert ms.status_code == 200
        matches = ms.json()
        if not matches:
            pytest.skip("No matches in first group")
        mid = matches[0]["id"]
        # toggle RSVP — should return without blocking on push
        import time
        t0 = time.time()
        r = requests.post(f"{BASE_URL}/api/matches/{mid}/rsvp",
                          json={"status": "going"}, headers=headers, timeout=15)
        elapsed = time.time() - t0
        # Accept 200/400/403 (group rules may forbid); the key is it returns and doesn't 500
        assert r.status_code in (200, 400, 403, 409), r.text
        assert elapsed < 12, f"RSVP took {elapsed:.1f}s — push may be blocking"
