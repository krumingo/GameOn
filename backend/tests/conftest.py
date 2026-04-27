"""Shared pytest fixtures."""
import os
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env to pick public REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
# Load backend env to expose MONGO_URL/DB_NAME for direct DB checks
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL must be set")


def _resolve_seed_group_ids():
    """Look up the actual ObjectIds of seeded groups by entry_code.

    The hardcoded IDs in older test files drift when the DB is reseeded with
    new ObjectIds; this helper keeps tests stable across reseeds.
    Returns a dict: {"DIT2026": "<oid>", "SPORT26": "<oid>"} (str). Falls back
    to legacy hardcoded IDs if API is unreachable.
    """
    try:
        # ensure seed exists
        try:
            requests.post(f"{BASE_URL}/api/dev/seed-demo-data", timeout=30)
        except Exception:
            pass
        tok = requests.post(f"{BASE_URL}/api/auth/super-test-login", timeout=30).json()["token"]
        groups = requests.get(
            f"{BASE_URL}/api/groups/my",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=30,
        ).json()
        out = {}
        for g in groups or []:
            ec = g.get("entry_code")
            if ec in ("DIT2026", "SPORT26"):
                out[ec] = g["id"]
        return out
    except Exception:
        return {}


_SEED_IDS = _resolve_seed_group_ids()
if _SEED_IDS.get("DIT2026"):
    os.environ["TEST_DIT_GROUP_ID"] = _SEED_IDS["DIT2026"]
if _SEED_IDS.get("SPORT26"):
    os.environ["TEST_SPORT_GROUP_ID"] = _SEED_IDS["SPORT26"]


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def super_token(client):
    r = client.post(f"{BASE_URL}/api/auth/super-test-login")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def super_client(client, super_token):
    client.headers.update({"Authorization": f"Bearer {super_token}"})
    return client
