"""
Tiny Supabase REST client (Auth + PostgREST) used by the Python API.

Security model
--------------
* Only the PUBLIC publishable/anon key is used (header ``apikey``).
* Every data request carries the signed-in user's own access token
  (``Authorization: Bearer <user JWT>``), so PostgreSQL Row Level Security from
  supabase/schema.sql applies to the Python service exactly as it does to the browser.
* The user's identity is checked by Supabase Auth itself (GET /auth/v1/user);
  no JWT secret is needed on this server.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from .config import Settings

ITEM_COLUMNS = "id,type,title,description,category,color,brand,location,date,status,user_id"


class SupabaseError(Exception):
    def __init__(self, status: int, message: str, code: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


class NotConfiguredError(SupabaseError):
    def __init__(self) -> None:
        super().__init__(503, "Supabase is not configured for the Python API (demo mode). Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.", "not_configured")


class AuthError(SupabaseError):
    pass


class SupabaseRest:
    def __init__(self, settings: Settings, client: Optional[httpx.Client] = None):
        self.settings = settings
        self._client = client

    # ------------------------------------------------------------------ helpers
    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self.settings.request_timeout)
        return self._client

    def _headers(self, user_token: Optional[str]) -> Dict[str, str]:
        if not self.settings.supabase_configured:
            raise NotConfiguredError()
        headers = {"apikey": self.settings.supabase_key, "Accept": "application/json"}
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
        elif self.settings.supabase_key.startswith("eyJ"):  # legacy anon JWT may also be sent as Bearer
            headers["Authorization"] = f"Bearer {self.settings.supabase_key}"
        return headers

    def _request(self, method: str, path: str, user_token: Optional[str] = None, **kwargs: Any) -> Any:
        url = self.settings.supabase_url + path
        try:
            response = self.client.request(method, url, headers=self._headers(user_token), **kwargs)
        except httpx.HTTPError as exc:
            raise SupabaseError(502, f"Could not reach Supabase: {exc.__class__.__name__}", "unreachable") from exc
        if response.status_code >= 400:
            try:
                body = response.json()
            except ValueError:
                body = {}
            message = body.get("message") or body.get("msg") or body.get("error_description") or response.text[:200]
            code = str(body.get("code") or body.get("error_code") or "")
            if response.status_code == 401 or path.startswith("/auth/"):
                raise AuthError(401, "Your session is not valid. Please log in again.", code or "invalid_token")
            raise SupabaseError(response.status_code, message, code)
        if not response.content:
            return None
        return response.json()

    # ------------------------------------------------------------------ API
    def get_user(self, user_token: str) -> Dict[str, Any]:
        """Ask Supabase Auth who owns this access token."""
        data = self._request("GET", "/auth/v1/user", user_token)
        if not data or not data.get("id"):
            raise AuthError(401, "Your session is not valid. Please log in again.", "invalid_token")
        return {"id": data["id"], "email": data.get("email")}

    def get_item(self, user_token: str, item_id: str) -> Optional[Dict[str, Any]]:
        rows = self._request("GET", "/rest/v1/items", user_token, params={"id": f"eq.{item_id}", "select": ITEM_COLUMNS})
        return rows[0] if rows else None

    def list_open_items(self, user_token: str, item_type: str, limit: int = 500) -> List[Dict[str, Any]]:
        params = {"type": f"eq.{item_type}", "status": "eq.open", "select": ITEM_COLUMNS, "order": "created_at.desc", "limit": str(limit)}
        return self._request("GET", "/rest/v1/items", user_token, params=params) or []

    def save_matches(self, user_token: str, item_id: str, matches: List[Dict[str, Any]]) -> int:
        """Calls the save_matches() database function (it re-validates every pair and enforces ownership)."""
        result = self._request("POST", "/rest/v1/rpc/save_matches", user_token, json={"p_item_id": item_id, "p_matches": matches})
        return int(result or 0)

    def ping(self) -> str:
        """Real connectivity check with the public key only. Returns '' when OK, else a reason."""
        try:
            self._request("GET", "/rest/v1/items", None, params={"select": "id", "limit": "1"})
            return ""
        except SupabaseError as exc:
            return exc.message

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
