"""
FindBack Python API (FastAPI)
=============================

Run (from the backend/ folder, with the virtual environment active):
    uvicorn app.main:app --reload --port 8000

Interactive docs: http://localhost:8000/docs

Endpoints
---------
GET  /api/health                         service status (add ?deep=true to really ping Supabase)
POST /api/match                          score a report against candidate reports (no database; works in demo mode)
POST /api/items/{item_id}/refresh-matches  recalculate + SAVE suggested matches for the caller's own report
                                          (needs "Authorization: Bearer <Supabase access token>")

All results are SUGGESTED matches, never proof of ownership.
"""
from __future__ import annotations

import platform
import re
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, load_settings
from .firebase_client import FirebaseAdminClient, FirebaseClientError
from .matching import ENGINE_VERSION
from .schemas import FirebaseStatus, HealthResponse, MatchRequest, MatchResponse, RefreshResponse, SupabaseStatus
from .services import match_reports, refresh_item_matches, refresh_item_matches_firebase
from .supabase_client import SupabaseError, SupabaseRest

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
FIRESTORE_ID_RE = re.compile(r"^[0-9a-zA-Z]{20}$")


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer ") or len(authorization) < 10:
        raise HTTPException(status_code=401, detail="Log in first: send 'Authorization: Bearer <ID token>'.")
    return authorization[7:].strip()



def create_app(
    settings: Optional[Settings] = None,
    rest: Optional[SupabaseRest] = None,
    fb_client: Optional[FirebaseAdminClient] = None,
) -> FastAPI:
    settings = settings or load_settings()
    rest = rest or SupabaseRest(settings)
    fb_client = fb_client or FirebaseAdminClient(settings)

    app = FastAPI(
        title="FindBack Matching API",
        version=__version__,
        description="Python matching service for FindBack. Returns SUGGESTED matches with explanations — never proof of ownership.",
    )
    # Only the real frontend origins may call this API from a browser (no wildcard).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
        max_age=600,
    )

    @app.get("/api/health", response_model=HealthResponse, tags=["status"], summary="Service health")
    def health(deep: bool = Query(False, description="Also make a real request to the database")) -> dict:
        reachable = None
        detail = "Supabase not configured: database endpoints are disabled (demo mode)." if not settings.supabase_configured else "Not checked."
        if settings.supabase_configured and deep:
            problem = rest.ping()
            reachable = problem == ""
            detail = "Connected: query on table 'items' succeeded." if reachable else f"Not reachable: {problem}"

        fb_reachable = None
        fb_detail = "Firebase not configured." if not settings.firebase_configured else "Not checked."
        if settings.firebase_configured and deep:
            fb_problem = fb_client.ping()
            fb_reachable = fb_problem == ""
            fb_detail = "Connected: query on collection 'items' succeeded." if fb_reachable else f"Not reachable: {fb_problem}"

        return {
            "version": __version__,
            "engine": ENGINE_VERSION,
            "python_version": platform.python_version(),
            "supabase": SupabaseStatus(configured=settings.supabase_configured, key_type=settings.key_kind, reachable=reachable, detail=detail).model_dump(),
            "firebase": FirebaseStatus(configured=settings.firebase_configured, reachable=fb_reachable, detail=fb_detail).model_dump(),
        }

    @app.post("/api/match", response_model=MatchResponse, tags=["matching"], summary="Score a report against candidates")
    def match(request: MatchRequest) -> dict:
        item = request.item.model_dump()
        candidates = [c.model_dump() for c in request.candidates]
        return match_reports(item, candidates, limit=request.limit, min_score=request.min_score)

    @app.post(
        "/api/items/{item_id}/refresh-matches",
        response_model=RefreshResponse,
        tags=["matching"],
        summary="Recalculate and save suggested matches for your own report (Firebase / Supabase)",
    )
    def refresh_matches(
        item_id: str,
        authorization: Optional[str] = Header(default=None),
        limit: int = Query(6, ge=1, le=20),
    ) -> dict:
        if not (UUID_RE.match(item_id) or FIRESTORE_ID_RE.match(item_id)):
            raise HTTPException(status_code=422, detail="item_id must be a report UUID.")

        token = _bearer_token(authorization)


        # Priority 1: Firebase if configured
        if settings.firebase_configured:
            try:
                return refresh_item_matches_firebase(fb_client, token, item_id, limit=limit)
            except FirebaseClientError as exc:
                status = exc.status if exc.status in (401, 403, 404, 503) else 502
                raise HTTPException(status_code=status, detail=exc.message) from exc

        # Priority 2: Supabase if configured
        if settings.supabase_configured:
            try:
                return refresh_item_matches(rest, token, item_id, limit=limit)
            except SupabaseError as exc:
                status = exc.status if exc.status in (401, 403, 404, 503) else 502
                raise HTTPException(status_code=status, detail=exc.message) from exc

        raise HTTPException(status_code=503, detail="Neither Firebase nor Supabase is configured for the Python API (demo mode).")

    return app


app = create_app()

