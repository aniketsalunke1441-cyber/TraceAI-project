"""
An in-process fake of the few Supabase endpoints the API calls, built on httpx.MockTransport.
It mimics the Row Level Security rules that matter here (save_matches only for your own report)
so the API can be tested without network access. The real behaviour is covered by
test_integration_supabase.py against PostgreSQL + supabase/schema.sql.
"""
from typing import Any, Dict, List

import httpx

PUBLISHABLE_KEY = "sb_publishable_test_key"


class FakeSupabase:
    def __init__(self, items: List[Dict[str, Any]], tokens: Dict[str, str]):
        self.items = {i["id"]: dict(i) for i in items}
        self.tokens = tokens  # access token -> user id
        self.saved: Dict[str, List[Dict[str, Any]]] = {}
        self.requests: List[httpx.Request] = []

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("apikey") != PUBLISHABLE_KEY:
            return httpx.Response(401, json={"message": "Invalid API key"})
        auth = request.headers.get("authorization", "")
        uid = self.tokens.get(auth[7:]) if auth.startswith("Bearer ") else None
        path = request.url.path

        if path == "/auth/v1/user":
            if not uid:
                return httpx.Response(401, json={"code": 401, "error_code": "bad_jwt", "msg": "invalid JWT"})
            return httpx.Response(200, json={"id": uid, "email": f"{uid}@example.com"})

        if path == "/rest/v1/items" and request.method == "GET":
            rows = list(self.items.values())
            for key, value in request.url.params.items():
                if key in ("select", "order", "limit"):
                    continue
                assert value.startswith("eq."), f"unsupported filter {key}={value}"
                rows = [r for r in rows if str(r.get(key)) == value[3:]]
            limit = int(request.url.params.get("limit", "1000"))
            return httpx.Response(200, json=rows[:limit])

        if path == "/rest/v1/rpc/save_matches" and request.method == "POST":
            body = httpx.Request("POST", "http://x", content=request.content).read()
            import json

            payload = json.loads(body)
            item = self.items.get(payload["p_item_id"])
            if not uid or not item or item["user_id"] != uid:
                return httpx.Response(403, json={"code": "42501", "message": "Only the reporter can refresh matches for this report"})
            self.saved[item["id"]] = payload["p_matches"]
            return httpx.Response(200, json=len(payload["p_matches"]))

        return httpx.Response(404, json={"message": f"unexpected {request.method} {path}"})
