"""
Prompt 6 (Match Room) backend regression.
Read-only / reversible checks against the public preview backend (gameon_dev).
Do NOT call /api/dev/reset on the dev DB (preview-shared).
"""
import os
import time
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            "https://football-chat-api.preview.emergentagent.com").rstrip("/")

def _dit_match_ids():
    """Resolve current upcoming match ids in DIT2026 group dynamically."""
    try:
        gid = os.environ.get("TEST_DIT_GROUP_ID")
        if not gid:
            return ("69ee4e4914834e35eac85cb2", "69ee4e4914834e35eac85cb3")
        tok = requests.post(f"{BASE_URL}/api/auth/super-test-login", timeout=20).json()["token"]
        r = requests.get(f"{BASE_URL}/api/groups/{gid}/matches",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        ms = r.json() if r.status_code == 200 else []
        ids = [m["id"] for m in ms]
        if len(ids) >= 2:
            return (ids[0], ids[1])
        if len(ids) == 1:
            return (ids[0], ids[0])
    except Exception:
        pass
    return ("69ee4e4914834e35eac85cb2", "69ee4e4914834e35eac85cb3")


DIT_GROUP_ID = os.environ.get("TEST_DIT_GROUP_ID", "69ee4e4914834e35eac85c99")     # DIT2026 PRO/TRIAL
DIT_MATCH_ID, DIT_MATCH_ID_2 = _dit_match_ids()
SPORT_GROUP_ID_HINT = "SPORT26"                # FREE


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/super-test-login", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- match read ----------
class TestMatchRead:
    def test_get_match_includes_rsvps_and_meta(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}", headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        # expected fields the room UI reads
        for k in ("id", "name", "start_datetime", "group_id", "going_count",
                  "free_spots", "pricing_mode", "status", "rsvps"):
            assert k in m, f"missing key: {k}"
        assert m["group_id"] == DIT_GROUP_ID
        assert isinstance(m["rsvps"], list)

    def test_get_upcoming_for_group(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/matches",
                         headers=auth, timeout=15)
        assert r.status_code == 200
        ms = r.json()
        assert isinstance(ms, list)
        ids = {m["id"] for m in ms}
        assert DIT_MATCH_ID in ids


# ---------- RSVP toggle (reversible) ----------
class TestRsvpToggle:
    def test_rsvp_going_then_revert(self, auth):
        # set going
        r1 = requests.post(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/rsvp",
                           headers=auth, json={"status": "going"}, timeout=15)
        assert r1.status_code == 200, r1.text
        m = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}",
                         headers=auth, timeout=15).json()
        assert m["user_rsvp_status"] in ("going", "waitlist")  # may waitlist if full
        # revert
        r2 = requests.post(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/rsvp",
                           headers=auth, json={"status": "not_going"}, timeout=15)
        assert r2.status_code == 200


# ---------- Payments ----------
class TestPayments:
    def test_payments_list(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/payments",
                         headers=auth, timeout=15)
        # owner of PRO group → 200
        assert r.status_code in (200, 403), r.text
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (list, dict))


# ---------- Results / Score ----------
class TestResults:
    def test_score_get(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/score",
                         headers=auth, timeout=15)
        assert r.status_code in (200, 403, 404)

    def test_results_get(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/results",
                         headers=auth, timeout=15)
        assert r.status_code in (200, 403, 404)


# ---------- Teams ----------
class TestTeams:
    def test_teams_get(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/teams",
                         headers=auth, timeout=15)
        assert r.status_code in (200, 403)
        if r.status_code == 200:
            d = r.json()
            assert isinstance(d, dict)


# ---------- Chat ----------
class TestChat:
    def test_chat_get(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/chat",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # may be {messages:[...]} or list
        msgs = d.get("messages", d) if isinstance(d, dict) else d
        assert isinstance(msgs, list)

    def test_chat_send_then_appear(self, auth):
        body = {"text": f"TEST_prompt6_chat_{int(time.time())}",
                "match_id": DIT_MATCH_ID}
        r = requests.post(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/chat",
                          headers=auth, json=body, timeout=15)
        assert r.status_code in (200, 201), r.text
        # verify visible
        time.sleep(0.5)
        g = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/chat",
                         headers=auth, timeout=15).json()
        msgs = g.get("messages", g) if isinstance(g, dict) else g
        texts = [m.get("text", "") for m in msgs]
        assert any(body["text"] in t for t in texts), \
            f"sent message not in chat list (got {len(texts)} msgs)"


# ---------- Pending / Waitlist endpoints ----------
class TestQueues:
    def test_waitlist(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/waitlist",
                         headers=auth, timeout=15)
        assert r.status_code in (200, 403)

    def test_pending(self, auth):
        r = requests.get(f"{BASE_URL}/api/matches/{DIT_MATCH_ID}/pending-requests",
                         headers=auth, timeout=15)
        assert r.status_code in (200, 403)
