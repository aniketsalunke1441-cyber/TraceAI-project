"""
Settings for the FindBack Python API, read from environment variables.

Order of precedence (first found wins):
  1. real environment variables
  2. backend/.env
  3. the frontend's .env in the project root (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
     so you only have to configure Supabase once.

Only the PUBLIC publishable/anon key is ever used. The API refuses to start if it is
given a secret / service_role key: every database call is made with the signed-in
user's own Supabase token, so Row Level Security always applies.
"""
from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Mapping, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

# Vite dev server and `vite preview` defaults
DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]


class ConfigError(ValueError):
    """Raised for unsafe or invalid configuration."""


def read_env_file(path: Path) -> Dict[str, str]:
    """Minimal .env parser (KEY=value, # comments, optional quotes)."""
    values: Dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def normalize_supabase_url(url: str) -> str:
    """Base project URL only: strips trailing slashes and a pasted /rest/v1, /auth/v1 or /storage/v1."""
    url = (url or "").strip().rstrip("/")
    return re.sub(r"/(rest|auth|storage)/v1$", "", url)


def key_role(key: str) -> str:
    """'publishable', 'anon', 'secret', 'service_role' or 'unknown' — never logs the key itself."""
    if key.startswith("sb_secret_"):
        return "secret"
    if key.startswith("sb_publishable_"):
        return "publishable"
    parts = key.split(".")
    if len(parts) == 3:
        try:
            payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
            return str(payload.get("role", "unknown"))
        except (ValueError, json.JSONDecodeError):
            return "unknown"
    return "unknown"


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_key: str = ""  # publishable / anon key only
    firebase_project_id: str = ""
    firebase_credentials_path: str = ""
    cors_origins: List[str] = field(default_factory=lambda: list(DEFAULT_CORS_ORIGINS))
    request_timeout: float = 10.0

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    @property
    def firebase_configured(self) -> bool:
        return bool(self.firebase_project_id or self.firebase_credentials_path)

    @property
    def key_kind(self) -> str:
        return key_role(self.supabase_key) if self.supabase_key else "none"


def load_settings(environ: Optional[Mapping[str, str]] = None, backend_env: Optional[Path] = None, root_env: Optional[Path] = None) -> Settings:
    env = dict(os.environ if environ is None else environ)
    backend_file = read_env_file(backend_env or BACKEND_DIR / ".env")
    root_file = read_env_file(root_env or PROJECT_DIR / ".env")

    def pick(*names: str) -> str:
        for source in (env, backend_file, root_file):
            for name in names:
                if source.get(name):
                    return source[name].strip()
        return ""

    url = normalize_supabase_url(pick("SUPABASE_URL", "VITE_SUPABASE_URL"))
    key = pick("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY")

    role = key_role(key) if key else "none"
    if role in ("secret", "service_role"):
        raise ConfigError(
            "Refusing to start: a SECRET / service_role key was configured. "
            "FindBack's API only needs the publishable (anon) key. Remove the secret key and rotate it in Supabase."
        )
    if url and not re.match(r"^https?://", url):
        raise ConfigError("SUPABASE_URL must look like https://<project-ref>.supabase.co")

    fb_project = pick("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID")
    fb_cred = pick("FIREBASE_CREDENTIALS_PATH", "FIREBASE_SERVICE_ACCOUNT_KEY_PATH", "GOOGLE_APPLICATION_CREDENTIALS")

    origins_raw = pick("CORS_ORIGINS")
    origins = [o.strip().rstrip("/") for o in origins_raw.split(",") if o.strip()] if origins_raw else list(DEFAULT_CORS_ORIGINS)
    if "*" in origins:
        raise ConfigError("CORS_ORIGINS must list exact origins (e.g. http://localhost:5173), not '*'.")

    timeout_raw = pick("REQUEST_TIMEOUT_SECONDS")
    timeout = float(timeout_raw) if timeout_raw else 10.0
    return Settings(
        supabase_url=url,
        supabase_key=key,
        firebase_project_id=fb_project,
        firebase_credentials_path=fb_cred,
        cors_origins=origins,
        request_timeout=timeout,
    )

