"""Tests for the Supabase REST client and the refresh service (no network)."""
import httpx
import pytest

from app.config import Settings
from app.services import refresh_item_matches
from app.supabase_client import AuthError, NotConfiguredError, SupabaseError, SupabaseRest
from fake_supabase import PUBLISHABLE_KEY, FakeSupabase

URL = "https://project.supabase.co"


@pytest.fixture
def fake(lost_phone, found_phone, found_bottle):
    return FakeSupabase([lost_phone, found_phone, found_bottle], tokens={"token-a": "owner-a", "token-b": "owner-b"})


@pytest.fixture
def rest(fake):
    settings = Settings(supabase_url=URL, supabase_key=PUBLISHABLE_KEY)
    return SupabaseRest(settings, client=httpx.Client(transport=fake.transport(), base_url=URL))


def test_publishable_key_goes_in_apikey_header_and_user_token_as_bearer(rest, fake, lost_phone):
    rest.get_item("token-a", lost_phone["id"])
    req = fake.requests[-1]
    assert req.headers["apikey"] == PUBLISHABLE_KEY
    assert req.headers["authorization"] == "Bearer token-a"
    assert req.url.params["id"] == f"eq.{lost_phone['id']}"


def test_publishable_key_is_never_sent_as_bearer_for_anonymous_calls(rest, fake):
    assert rest.ping() == ""
    assert "authorization" not in fake.requests[-1].headers


def test_get_user_verifies_identity_with_supabase_auth(rest):
    assert rest.get_user("token-a")["id"] == "owner-a"
    with pytest.raises(AuthError):
        rest.get_user("forged-token")


def test_not_configured_raises_503():
    with pytest.raises(NotConfiguredError) as exc:
        SupabaseRest(Settings()).get_item("t", "x")
    assert exc.value.status == 503


def test_network_failure_is_reported_as_unreachable():
    def boom(request):
        raise httpx.ConnectError("no route")

    rest = SupabaseRest(Settings(supabase_url=URL, supabase_key=PUBLISHABLE_KEY), client=httpx.Client(transport=httpx.MockTransport(boom)))
    with pytest.raises(SupabaseError) as exc:
        rest.get_item("t", "x")
    assert exc.value.status == 502 and exc.value.code == "unreachable"
    assert "Could not reach Supabase" in rest.ping()


def test_refresh_saves_matches_for_own_report(rest, fake, lost_phone, found_phone):
    result = refresh_item_matches(rest, "token-a", lost_phone["id"])
    assert result["saved_to_database"] is True and result["saved_count"] == 1
    assert [m["item_id"] for m in result["matches"]] == [found_phone["id"]]
    assert result["matches"][0]["verified_ownership"] is False
    saved = fake.saved[lost_phone["id"]]
    assert saved[0]["item_id"] == found_phone["id"] and saved[0]["score"] >= 75 and saved[0]["reasons"]


def test_refresh_refuses_someone_elses_report(rest, fake, lost_phone):
    with pytest.raises(SupabaseError) as exc:
        refresh_item_matches(rest, "token-b", lost_phone["id"])
    assert exc.value.status == 403
    assert lost_phone["id"] not in fake.saved


def test_refresh_of_resolved_report_clears_matches(rest, fake, lost_phone):
    fake.items[lost_phone["id"]]["status"] = "resolved"
    result = refresh_item_matches(rest, "token-a", lost_phone["id"])
    assert result["matches"] == [] and fake.saved[lost_phone["id"]] == []


def test_refresh_unknown_report_is_404(rest):
    with pytest.raises(SupabaseError) as exc:
        refresh_item_matches(rest, "token-a", "99999999-9999-4999-8999-999999999999")
    assert exc.value.status == 404
