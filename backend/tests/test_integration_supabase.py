"""
Integration test: the Python API against a REAL Supabase-compatible server
(PostgreSQL + supabase/schema.sql + Row Level Security).

Skipped unless these environment variables are set:
    FINDBACK_IT_SUPABASE_URL   e.g. https://<ref>.supabase.co  (or a local test server)
    FINDBACK_IT_SUPABASE_KEY   the publishable / anon key

WARNING: against a real project this creates two test accounts
(findback.pytest.*@example.com) and two test reports; the reports are deleted
afterwards, the accounts remain (delete them in Authentication -> Users).
"Confirm email" must be OFF.
"""
import os
import uuid
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services import refresh_item_matches
from app.supabase_client import SupabaseError, SupabaseRest

URL = os.environ.get("FINDBACK_IT_SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("FINDBACK_IT_SUPABASE_KEY", "")
pytestmark = [pytest.mark.integration, pytest.mark.skipif(not (URL and KEY), reason="set FINDBACK_IT_SUPABASE_URL and FINDBACK_IT_SUPABASE_KEY")]


def headers(token=None):
    h = {"apikey": KEY}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


@pytest.fixture(scope="module")
def http():
    with httpx.Client(base_url=URL, timeout=15) as client:
        yield client


def signup(http, name):
    email = f"findback.pytest.{name}.{uuid.uuid4().hex[:8]}@example.com"
    r = http.post("/auth/v1/signup", headers=headers(), json={"email": email, "password": "Pytest-" + uuid.uuid4().hex, "data": {"full_name": f"Pytest {name}"}})
    assert r.status_code == 200 and r.json().get("access_token"), f"signup failed ({r.status_code}): is 'Confirm email' off? {r.text[:200]}"
    body = r.json()
    return {"token": body["access_token"], "id": body["user"]["id"]}


@pytest.fixture(scope="module")
def world(http):
    a, b = signup(http, "alpha"), signup(http, "bravo")
    today = date.today().isoformat()

    def create(user, **fields):
        r = http.post("/rest/v1/items", headers={**headers(user["token"]), "Prefer": "return=representation"}, json={"user_id": user["id"], "reporter_name": "Pytest", "date": today, **fields})
        assert r.status_code == 201, r.text
        return r.json()[0]

    lost = create(a, type="lost", title="[PYTEST] Black iPhone 13 blue case", description="Black iPhone in a blue silicone case, cracked corner", category="Electronics", color="Black", brand="Apple", location="Central Library 2nd floor")
    found = create(b, type="found", title="[PYTEST] Black Apple phone in blue cover", description="Black iPhone with blue cover found in the library", category="Electronics", color="Black", brand="Apple", location="Library 2nd floor")
    yield {"a": a, "b": b, "lost": lost, "found": found}
    for user, item in ((a, lost), (b, found)):
        http.delete(f"/rest/v1/items?id=eq.{item['id']}", headers=headers(user["token"]))


@pytest.fixture(scope="module")
def rest():
    r = SupabaseRest(Settings(supabase_url=URL, supabase_key=KEY))
    yield r
    r.close()


def test_ping_reaches_the_database(rest):
    assert rest.ping() == ""


def test_refresh_saves_suggested_match_under_rls(rest, http, world):
    result = refresh_item_matches(rest, world["a"]["token"], world["lost"]["id"])
    assert result["saved_to_database"] and result["saved_count"] == 1
    assert result["matches"][0]["item_id"] == world["found"]["id"] and result["matches"][0]["score"] >= 75
    rows = http.get(f"/rest/v1/matches?lost_item_id=eq.{world['lost']['id']}&select=found_item_id,score,reasons", headers=headers()).json()
    assert len(rows) == 1 and rows[0]["found_item_id"] == world["found"]["id"] and rows[0]["reasons"]


def test_refreshing_again_does_not_duplicate(rest, http, world):
    refresh_item_matches(rest, world["a"]["token"], world["lost"]["id"])
    rows = http.get(f"/rest/v1/matches?lost_item_id=eq.{world['lost']['id']}&select=id", headers=headers()).json()
    assert len(rows) == 1


def test_database_itself_blocks_saving_matches_for_someone_elses_report(rest, world):
    with pytest.raises(SupabaseError) as exc:
        rest.save_matches(world["b"]["token"], world["lost"]["id"], [])
    assert exc.value.status in (401, 403)


def test_api_endpoint_end_to_end(world):
    settings = Settings(supabase_url=URL, supabase_key=KEY)
    client = TestClient(create_app(settings))
    ok = client.post(f"/api/items/{world['found']['id']}/refresh-matches", headers={"Authorization": f"Bearer {world['b']['token']}"})
    assert ok.status_code == 200 and ok.json()["matches"][0]["item_id"] == world["lost"]["id"]
    denied = client.post(f"/api/items/{world['found']['id']}/refresh-matches", headers={"Authorization": f"Bearer {world['a']['token']}"})
    assert denied.status_code == 403
    forged = client.post(f"/api/items/{world['found']['id']}/refresh-matches", headers={"Authorization": "Bearer forged-token-not-valid"})
    assert forged.status_code == 401
    assert client.get("/api/health?deep=true").json()["supabase"]["reachable"] is True
