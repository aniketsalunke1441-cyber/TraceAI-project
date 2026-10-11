"""Configuration and secret-key safety tests (app/config.py)."""
import base64
import json

import pytest

from app.config import DEFAULT_CORS_ORIGINS, ConfigError, key_role, load_settings, normalize_supabase_url


def fake_jwt(role):
    payload = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{payload}.signature"


@pytest.fixture
def no_files(tmp_path):
    return {"backend_env": tmp_path / "none1", "root_env": tmp_path / "none2"}


def test_defaults_are_demo_mode(no_files):
    s = load_settings({}, **no_files)
    assert not s.supabase_configured
    assert s.cors_origins == DEFAULT_CORS_ORIGINS


def test_reads_frontend_env_file_when_backend_vars_missing(tmp_path):
    root = tmp_path / ".env"
    root.write_text("VITE_SUPABASE_URL=https://abcd.supabase.co/rest/v1/\nVITE_SUPABASE_ANON_KEY='sb_publishable_test123'\n")
    s = load_settings({}, backend_env=tmp_path / "missing", root_env=root)
    assert s.supabase_url == "https://abcd.supabase.co"
    assert s.supabase_key == "sb_publishable_test123"
    assert s.key_kind == "publishable"


def test_environment_variables_take_precedence(tmp_path):
    root = tmp_path / ".env"
    root.write_text("VITE_SUPABASE_URL=https://from-file.supabase.co\nVITE_SUPABASE_ANON_KEY=sb_publishable_file\n")
    s = load_settings({"SUPABASE_URL": "https://from-env.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_env"}, backend_env=tmp_path / "x", root_env=root)
    assert s.supabase_url == "https://from-env.supabase.co" and s.supabase_key == "sb_publishable_env"


@pytest.mark.parametrize("secret", ["sb_secret_abc123", fake_jwt("service_role")])
def test_refuses_secret_and_service_role_keys(secret, no_files):
    with pytest.raises(ConfigError, match="SECRET"):
        load_settings({"SUPABASE_URL": "https://abcd.supabase.co", "SUPABASE_PUBLISHABLE_KEY": secret}, **no_files)


def test_accepts_legacy_anon_jwt(no_files):
    s = load_settings({"SUPABASE_URL": "https://abcd.supabase.co", "SUPABASE_ANON_KEY": fake_jwt("anon")}, **no_files)
    assert s.key_kind == "anon"


def test_cors_rejects_wildcard_and_parses_list(no_files):
    with pytest.raises(ConfigError):
        load_settings({"CORS_ORIGINS": "*"}, **no_files)
    s = load_settings({"CORS_ORIGINS": "http://localhost:5173/, https://findback.vercel.app"}, **no_files)
    assert s.cors_origins == ["http://localhost:5173", "https://findback.vercel.app"]


def test_rejects_non_http_url(no_files):
    with pytest.raises(ConfigError):
        load_settings({"SUPABASE_URL": "abcd.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_x"}, **no_files)


def test_url_normalisation_and_key_roles():
    assert normalize_supabase_url(" https://x.supabase.co/auth/v1/ ") == "https://x.supabase.co"
    assert key_role("random") == "unknown"
    assert key_role(fake_jwt("anon")) == "anon"
