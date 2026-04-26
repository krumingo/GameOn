"""Shared pytest fixtures."""
import os
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env to pick public REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL must be set")


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
