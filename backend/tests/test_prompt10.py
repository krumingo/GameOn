"""PROMPT 10 — Production deploy prep regression tests.

Covers:
- IAP receipt validate stub endpoint (auth, validation, return shape)
- push_log unique index existence (de-dup of reminder pushes)
- Reminder background task wiring (lifespan still healthy)
- Existing endpoints unchanged (auth super-test-login, /me, /groups/my, /push/prefs)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/auth/super-test-login", timeout=15)
    assert r.status_code == 200, f"super-test-login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def group_id(auth_headers):
    r = requests.get(f"{API}/groups/my", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    groups = r.json()
    assert isinstance(groups, list) and len(groups) > 0, "no groups for super tester"
    return groups[0]["id"]


# ---------------- Health ----------------
def test_health_ok():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------- IAP validate stub ----------------
def test_iap_validate_requires_auth():
    r = requests.post(
        f"{API}/billing/validate-iap-receipt",
        json={"receipt_data": "abc", "platform": "ios", "group_id": "x"},
        timeout=10,
    )
    assert r.status_code in (401, 403), f"expected auth error, got {r.status_code}"


def test_iap_validate_invalid_platform(auth_headers, group_id):
    r = requests.post(
        f"{API}/billing/validate-iap-receipt",
        headers=auth_headers,
        json={"receipt_data": "abc123", "platform": "windows", "group_id": group_id},
        timeout=10,
    )
    assert r.status_code == 400
    assert "platform" in (r.json().get("detail") or "").lower()


def test_iap_validate_empty_receipt(auth_headers, group_id):
    r = requests.post(
        f"{API}/billing/validate-iap-receipt",
        headers=auth_headers,
        json={"receipt_data": "", "platform": "ios", "group_id": group_id},
        timeout=10,
    )
    assert r.status_code == 400
    assert "receipt_data" in (r.json().get("detail") or "").lower()


def test_iap_validate_returns_stub_false_for_valid_request(auth_headers, group_id):
    for plat in ("ios", "android"):
        r = requests.post(
            f"{API}/billing/validate-iap-receipt",
            headers=auth_headers,
            json={"receipt_data": "BASE64_RECEIPT_DATA", "platform": plat, "group_id": group_id},
            timeout=10,
        )
        assert r.status_code == 200, f"{plat}: {r.status_code} {r.text}"
        body = r.json()
        assert body["valid"] is False
        assert body["platform"] == plat
        assert "not yet implemented" in body["message"].lower()


# ---------------- push_log unique index ----------------
def test_push_log_unique_index_exists():
    """Verify the unique compound index on push_log (match_id, user_id, type) exists."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def check():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        idxs = await db.push_log.index_information()
        client.close()
        return idxs

    idxs = asyncio.run(check())
    found = False
    for name, info in idxs.items():
        keys = info.get("key", [])
        keynames = [k[0] for k in keys]
        if set(keynames) == {"match_id", "user_id", "type"} and info.get("unique"):
            found = True
            break
    assert found, f"push_log unique compound index missing. indexes={list(idxs.keys())}"


# ---------------- Reminder service unit ----------------
def test_reminder_service_module_imports_and_loop_callable():
    from services.reminder_service import (
        check_and_send_reminders,
        reminder_background_loop,
        DEFAULT_REMINDER_HOURS,
    )

    assert callable(check_and_send_reminders)
    assert callable(reminder_background_loop)
    assert DEFAULT_REMINDER_HOURS == 24


def test_reminder_service_runs_without_error():
    """check_and_send_reminders should run without raising and return an int."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from deps import set_db
    from services.reminder_service import check_and_send_reminders

    async def run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        set_db(db)
        n = await check_and_send_reminders()
        client.close()
        return n

    n = asyncio.run(run())
    assert isinstance(n, int)
    assert n >= 0


# ---------------- Regression: existing endpoints unchanged ----------------
def test_me_endpoint(auth_headers):
    r = requests.get(f"{API}/me", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "id" in body
    assert body.get("phone") == "+359888999999"


def test_my_groups_regression(auth_headers):
    r = requests.get(f"{API}/groups/my", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_push_prefs_regression(auth_headers):
    r = requests.get(f"{API}/push/prefs", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "reminders" in body
    assert "reminder_hours" in body


def test_billing_status_regression(auth_headers, group_id):
    r = requests.get(f"{API}/billing/group/{group_id}", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "plan" in body
    assert body["plan"] in ("FREE", "TRIAL", "PRO", "GRACE")


def test_listings_regression():
    r = requests.get(f"{API}/listings", timeout=10)
    # Public endpoint: allow 200 or 401 depending on requireAuth setup
    assert r.status_code in (200, 401)
