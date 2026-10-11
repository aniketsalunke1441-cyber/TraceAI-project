"""HTTP-level tests for the FastAPI app (uses FastAPI's TestClient)."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas import DISCLAIMER
from app.supabase_client import SupabaseRest
from fake_supabase import PUBLISHABLE_KEY, FakeSupabase

URL = "https://project.supabase.co"
FRONTEND = "http://localhost:5173"


@pytest.fixture
def demo_client():
    """API with no Supabase configured (demo mode)."""
    return TestClient(create_app(Settings()))


@pytest.fixture
def fake(lost_phone, found_phone, found_bottle):
    return FakeSupabase([lost_phone, found_phone, found_bottle], tokens={"token-a": "owner-a", "token-b": "owner-b"})


@pytest.fixture
def live_client(fake):
    settings = Settings(supabase_url=URL, supabase_key=PUBLISHABLE_KEY)
    rest = SupabaseRest(settings, client=httpx.Client(transport=fake.transport(), base_url=URL))
    return TestClient(create_app(settings, rest))


def test_health_in_demo_mode(demo_client):
    body = demo_client.get("/api/health").json()
    assert body["status"] == "ok" and body["engine"].startswith("findback-matching")
    assert body["supabase"]["configured"] is False and body["supabase"]["reachable"] is None


def test_deep_health_really_pings_supabase(live_client, fake):
    body = live_client.get("/api/health?deep=true").json()
    assert body["supabase"] == {"configured": True, "key_type": "publishable", "reachable": True, "detail": "Connected: query on table 'items' succeeded."}
    assert fake.requests[-1].url.path == "/rest/v1/items"


def test_match_endpoint_returns_explained_suggestions(demo_client, lost_phone, found_phone, found_bottle):
    r = demo_client.post("/api/match", json={"item": lost_phone, "candidates": [found_phone, found_bottle]})
    assert r.status_code == 200
    body = r.json()
    assert body["result_type"] == "suggested_matches" and body["disclaimer"] == DISCLAIMER
    assert body["count"] == 1
    m = body["matches"][0]
    assert m["item_id"] == found_phone["id"] and m["label"] == "Strong match" and m["verified_ownership"] is False
    assert any("Same brand: Apple" in r for r in m["reasons"]) and len(m["breakdown"]) == 6


def test_match_endpoint_validates_input(demo_client, lost_phone):
    bad = dict(lost_phone, type="stolen")
    r = demo_client.post("/api/match", json={"item": bad, "candidates": []})
    assert r.status_code == 422
    r = demo_client.post("/api/match", json={"item": dict(lost_phone, title="ab")})
    assert r.status_code == 422
    r = demo_client.post("/api/match", json={"item": lost_phone, "limit": 500})
    assert r.status_code == 422
    r = demo_client.post("/api/match", json={"item": lost_phone, "unexpected": True})
    assert r.status_code == 422


def test_refresh_requires_supabase(demo_client, lost_phone):
    r = demo_client.post(f"/api/items/{lost_phone['id']}/refresh-matches", headers={"Authorization": "Bearer token-a-long-enough"})
    assert r.status_code == 503


def test_refresh_requires_login(live_client, lost_phone):
    assert live_client.post(f"/api/items/{lost_phone['id']}/refresh-matches").status_code == 401
    r = live_client.post(f"/api/items/{lost_phone['id']}/refresh-matches", headers={"Authorization": "Bearer forged-token-123456"})
    assert r.status_code == 401


def test_refresh_rejects_bad_ids(live_client):
    r = live_client.post("/api/items/not-a-uuid/refresh-matches", headers={"Authorization": "Bearer token-a"})
    assert r.status_code == 422


def test_refresh_saves_for_owner_and_blocks_others(live_client, fake, lost_phone, found_phone):
    fake.tokens["token-a-valid-for-tests"] = "owner-a"
    fake.tokens["token-b-valid-for-tests"] = "owner-b"
    r = live_client.post(f"/api/items/{lost_phone['id']}/refresh-matches", headers={"Authorization": "Bearer token-a-valid-for-tests"})
    assert r.status_code == 200
    body = r.json()
    assert body["saved_to_database"] is True and body["saved_count"] == 1 and body["matches"][0]["item_id"] == found_phone["id"]
    r = live_client.post(f"/api/items/{lost_phone['id']}/refresh-matches", headers={"Authorization": "Bearer token-b-valid-for-tests"})
    assert r.status_code == 403


def test_cors_allows_only_the_frontend_origin(demo_client):
    ok = demo_client.options("/api/match", headers={"Origin": FRONTEND, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == FRONTEND
    evil = demo_client.options("/api/match", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert evil.headers.get("access-control-allow-origin") is None
    simple = demo_client.get("/api/health", headers={"Origin": FRONTEND})
    assert simple.headers["access-control-allow-origin"] == FRONTEND
