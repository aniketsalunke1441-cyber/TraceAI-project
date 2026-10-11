"""Business logic for the API, kept separate from FastAPI so it is easy to test."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping

from .matching import ENGINE_VERSION, find_matches_for, match_label
from .supabase_client import SupabaseError, SupabaseRest

MATCHES_TO_STORE = 20  # same as the frontend (src/lib/api.js)


def to_suggestions(matches: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for m in matches:
        other = m["item"]
        out.append(
            {
                "item_id": str(other["id"]),
                "title": other.get("title", ""),
                "type": other.get("type"),
                "score": m["score"],
                "label": match_label(m["score"]),
                "reasons": m["reasons"],
                "breakdown": m["breakdown"],
                "verified_ownership": False,
            }
        )
    return out


def match_reports(item: Mapping[str, Any], candidates: List[Mapping[str, Any]], limit: int, min_score: int) -> Dict[str, Any]:
    """Stateless scoring (no database). Used by POST /api/match."""
    matches = find_matches_for(item, candidates, limit=limit, min_score=min_score)
    return {"engine": ENGINE_VERSION, "item_id": str(item["id"]), "count": len(matches), "matches": to_suggestions(matches)}


def refresh_item_matches(rest: SupabaseRest, user_token: str, item_id: str, limit: int = 6) -> Dict[str, Any]:
    """
    Recalculate the suggested matches for one of the caller's OWN reports and save them
    in Supabase. Every step runs as the signed-in user, so RLS and the save_matches()
    checks in supabase/schema.sql still apply.
    """
    user = rest.get_user(user_token)  # identity verified by Supabase Auth
    item = rest.get_item(user_token, item_id)
    if item is None:
        raise SupabaseError(404, "Report not found.", "not_found")
    if item.get("user_id") != user["id"]:
        raise SupabaseError(403, "Only the person who posted this report can refresh its matches.", "not_owner")

    matches: List[Dict[str, Any]] = []
    if item.get("status") == "open":
        opposite = "found" if item.get("type") == "lost" else "lost"
        candidates = rest.list_open_items(user_token, opposite)
        matches = find_matches_for(item, candidates, limit=MATCHES_TO_STORE)

    payload = [{"item_id": str(m["item"]["id"]), "score": m["score"], "reasons": m["reasons"], "breakdown": m["breakdown"]} for m in matches]
    saved = rest.save_matches(user_token, item_id, payload)  # also clears stale matches
    shown = matches[:limit]
    return {
        "engine": ENGINE_VERSION,
        "item_id": item_id,
        "count": len(shown),
        "matches": to_suggestions(shown),
        "saved_to_database": True,
        "saved_count": saved,
    }


def refresh_item_matches_firebase(fb_client: Any, user_token: str, item_id: str, limit: int = 6) -> Dict[str, Any]:
    """
    Recalculate suggested matches for one of the caller's OWN reports and save them
    in Cloud Firestore. Caller identity is cryptographically verified via Firebase Auth ID token.
    """
    from .firebase_client import FirebaseClientError

    user = fb_client.verify_token(user_token)
    item = fb_client.get_item(item_id)
    if item is None:
        raise FirebaseClientError(404, "Report not found.", "not_found")
    if item.get("user_id") != user["id"]:
        raise FirebaseClientError(403, "Only the person who posted this report can refresh its matches.", "not_owner")

    matches: List[Dict[str, Any]] = []
    if item.get("status") == "open":
        opposite = "found" if item.get("type") == "lost" else "lost"
        candidates = fb_client.list_open_items(opposite)
        matches = find_matches_for(item, candidates, limit=MATCHES_TO_STORE)

    payload = []
    for m in matches:
        other = m["item"]
        payload.append({
            "lost_item_id": item["id"] if item.get("type") == "lost" else other["id"],
            "found_item_id": item["id"] if item.get("type") == "found" else other["id"],
            "score": m["score"],
            "reasons": m["reasons"],
            "breakdown": m["breakdown"],
        })
    saved = fb_client.save_matches(item_id, payload)
    shown = matches[:limit]
    return {
        "engine": ENGINE_VERSION,
        "item_id": item_id,
        "count": len(shown),
        "matches": to_suggestions(shown),
        "saved_to_database": True,
        "saved_count": saved,
    }

