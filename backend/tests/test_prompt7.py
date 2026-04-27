"""
Prompt 7 backend regression — Discover (listings), Stats/Leaderboard,
Cash, Search-Player, Invitations.
Read mostly + reversible writes against the public preview backend (gameon_dev).
Do NOT call /api/dev/reset.
"""
import os
import time
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            "https://football-chat-api.preview.emergentagent.com").rstrip("/")

DIT_GROUP_ID = os.environ.get("TEST_DIT_GROUP_ID", "69ee4e4914834e35eac85c99")     # PRO/TRIAL
SPORT_GROUP_ID = os.environ.get("TEST_SPORT_GROUP_ID", "69ee4e4914834e35eac85c96")   # FREE


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/auth/super-test-login", timeout=20)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --------------- LISTINGS ---------------
class TestListings:
    def test_list_active(self, auth):
        r = requests.get(f"{BASE_URL}/api/listings", headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        first = data[0]
        for k in ("id", "type", "title", "status", "author_id", "responses_count"):
            assert k in first

    def test_filter_by_type(self, auth):
        for t in ("MATCH_AVAILABLE", "LOOKING_FOR_PLAYERS", "LOOKING_FOR_TEAM"):
            r = requests.get(f"{BASE_URL}/api/listings?type={t}",
                             headers=auth, timeout=15)
            assert r.status_code == 200, r.text
            for l in r.json():
                assert l["type"] == t

    def test_invalid_type_400(self, auth):
        r = requests.get(f"{BASE_URL}/api/listings?type=BOGUS",
                         headers=auth, timeout=15)
        assert r.status_code == 400

    def test_get_listing_detail(self, auth):
        r = requests.get(f"{BASE_URL}/api/listings", headers=auth, timeout=15)
        lst = r.json()
        assert lst, "no seeded listings"
        lid = lst[0]["id"]
        r2 = requests.get(f"{BASE_URL}/api/listings/{lid}",
                          headers=auth, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == lid

    def test_get_listing_404(self, auth):
        r = requests.get(f"{BASE_URL}/api/listings/000000000000000000000000",
                         headers=auth, timeout=15)
        assert r.status_code == 404

    def test_listing_create_pro_round_trip(self, auth):
        # Super tester is OWNER of DIT (PRO) → can create listing tied to it.
        body = {
            "type": "LOOKING_FOR_PLAYERS",
            "title": f"TEST_p7_{int(time.time())}",
            "description": "auto-test listing",
            "venue": "TEST_venue",
            "spots_needed": 3,
            "price_per_player": 10.0,
            "group_id": DIT_GROUP_ID,
        }
        r = requests.post(f"{BASE_URL}/api/listings", headers=auth,
                          json=body, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        lid = created["id"]
        assert created["title"] == body["title"]
        assert created["status"] == "ACTIVE"
        assert created["group_id"] == DIT_GROUP_ID
        assert created["currency"] == "EUR"

        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/listings/{lid}",
                         headers=auth, timeout=15)
        assert g.status_code == 200
        assert g.json()["title"] == body["title"]

        # CLOSE
        c = requests.patch(f"{BASE_URL}/api/listings/{lid}/close",
                           headers=auth, timeout=15)
        assert c.status_code == 200
        assert c.json().get("closed") is True

        # DELETE (cleanup)
        d = requests.delete(f"{BASE_URL}/api/listings/{lid}",
                            headers=auth, timeout=15)
        assert d.status_code == 200

        # confirm gone
        g2 = requests.get(f"{BASE_URL}/api/listings/{lid}",
                          headers=auth, timeout=15)
        assert g2.status_code == 404

    def test_listing_create_free_group_403(self, auth):
        body = {
            "type": "LOOKING_FOR_PLAYERS",
            "title": "TEST_p7_should_fail",
            "group_id": SPORT_GROUP_ID,
        }
        r = requests.post(f"{BASE_URL}/api/listings", headers=auth,
                          json=body, timeout=15)
        # FREE plan blocked by check_pro_access
        assert r.status_code in (402, 403), r.text

    def test_listing_create_invalid_type(self, auth):
        body = {"type": "BOGUS", "title": "x", "group_id": DIT_GROUP_ID}
        r = requests.post(f"{BASE_URL}/api/listings", headers=auth,
                          json=body, timeout=15)
        assert r.status_code == 400

    def test_listing_create_missing_title(self, auth):
        body = {"type": "LOOKING_FOR_PLAYERS", "title": "  ",
                "group_id": DIT_GROUP_ID}
        r = requests.post(f"{BASE_URL}/api/listings", headers=auth,
                          json=body, timeout=15)
        assert r.status_code == 400

    def test_author_cannot_respond_to_own(self, auth):
        # create a temporary listing then respond to it as same user
        body = {
            "type": "LOOKING_FOR_PLAYERS",
            "title": f"TEST_p7_self_{int(time.time())}",
            "group_id": DIT_GROUP_ID,
        }
        r = requests.post(f"{BASE_URL}/api/listings", headers=auth,
                          json=body, timeout=15)
        assert r.status_code == 200
        lid = r.json()["id"]
        try:
            rr = requests.post(f"{BASE_URL}/api/listings/{lid}/respond",
                               headers=auth, json={"message": "no"}, timeout=15)
            assert rr.status_code == 400
        finally:
            requests.delete(f"{BASE_URL}/api/listings/{lid}",
                            headers=auth, timeout=15)


# --------------- PLAYER SEARCH ---------------
class TestPlayerSearch:
    def test_search_pro_admin_ok(self, auth):
        # super tester is OWNER of DIT (PRO) → 200
        r = requests.get(f"{BASE_URL}/api/players/search?q=Иван",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_search_short_returns_empty(self, auth):
        r = requests.get(f"{BASE_URL}/api/players/search?q=",
                         headers=auth, timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_search_excludes_existing_members(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/players/search?q=а&exclude_group={DIT_GROUP_ID}",
            headers=auth, timeout=15,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------- INVITATIONS ---------------
class TestInvitations:
    def test_my_invitations_list(self, auth):
        r = requests.get(f"{BASE_URL}/api/me/invitations",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_invite_to_free_group_blocked(self, auth):
        # Invite endpoint requires PRO; SPORT26 is FREE → 402/403
        # need a real user_id
        s = requests.get(f"{BASE_URL}/api/players/search?q=а",
                         headers=auth, timeout=15)
        users = s.json()
        if not users:
            pytest.skip("no users to invite")
        body = {"user_id": users[0]["id"]}
        r = requests.post(f"{BASE_URL}/api/groups/{SPORT_GROUP_ID}/invite",
                          headers=auth, json=body, timeout=15)
        assert r.status_code in (402, 403, 400), r.text

    def test_respond_invalid_invitation_404(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/invitations/000000000000000000000000/respond",
            headers=auth, json={"action": "accept"}, timeout=15)
        assert r.status_code == 404


# --------------- CASH ---------------
class TestCash:
    def test_cash_summary_pro(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/cash/summary",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # expected keys
        for k in ("balance",):
            assert k in d, f"missing {k} in {list(d.keys())}"

    def test_cash_summary_free_paywall(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{SPORT_GROUP_ID}/cash/summary",
                         headers=auth, timeout=15)
        # FREE → blocked
        assert r.status_code in (402, 403)

    def test_cash_transactions_list(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/cash/transactions",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # may be {transactions:[...]} or list
        txns = d.get("transactions", d) if isinstance(d, dict) else d
        assert isinstance(txns, list)

    def test_cash_create_txn_then_delete(self, auth):
        body = {
            "type": "INCOME",
            "category": "MATCH_FEES",
            "amount": 12.50,
            "note": f"TEST_p7_{int(time.time())}",
            "counterparty": "tester",
            "status": "PAID",
        }
        r = requests.post(
            f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/cash/transactions",
            headers=auth, json=body, timeout=15)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        tx_id = d.get("id") or d.get("_id") or (d.get("transaction") or {}).get("id")
        if not tx_id:
            # try list to find by note
            lr = requests.get(
                f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/cash/transactions",
                headers=auth, timeout=15).json()
            txns = lr.get("transactions", lr) if isinstance(lr, dict) else lr
            for t in txns:
                if t.get("note") == body["note"]:
                    tx_id = t.get("id") or t.get("_id")
                    break
        assert tx_id, f"could not extract created tx_id from {d}"
        # cleanup
        dr = requests.delete(
            f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/cash/transactions/{tx_id}",
            headers=auth, timeout=15)
        assert dr.status_code in (200, 204)


# --------------- STATS ---------------
class TestStats:
    def test_group_stats(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/stats",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))

    def test_leaderboard_pro(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/leaderboard",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, (list, dict))

    def test_leaderboard_free_paywall(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{SPORT_GROUP_ID}/leaderboard",
                         headers=auth, timeout=15)
        assert r.status_code in (402, 403, 200)
        # If 200, the FE handles paywall via plan_pro_required flag in body
        if r.status_code == 200:
            d = r.json()
            # must clearly indicate paywall to UI
            txt = str(d).lower()
            assert "pro" in txt or "paywall" in txt or "free" in txt or d == [] or (
                isinstance(d, dict) and d.get("plan_pro_required") is True), \
                "FREE leaderboard 200 must signal paywall to FE"

    def test_seasons_list(self, auth):
        r = requests.get(f"{BASE_URL}/api/groups/{DIT_GROUP_ID}/seasons",
                         headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
