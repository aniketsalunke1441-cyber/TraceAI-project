"""Pydantic request / response models for the FindBack Python API."""
from __future__ import annotations

from datetime import date as Date
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

DISCLAIMER = (
    "Suggested matches only. A match score is NOT proof of ownership: ownership is verified "
    "only when the item's reporter approves an ownership claim with proof."
)

ReportType = Literal["lost", "found"]
ReportStatus = Literal["open", "resolved"]


class Report(BaseModel):
    """A lost or found report (the same fields as the `items` table)."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=64, examples=["9d22c20d-d3c7-42d2-9e4c-2c592e741551"])
    type: ReportType
    title: str = Field(min_length=3, max_length=120, examples=["Black iPhone 13 with blue case"])
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="", max_length=40, examples=["Electronics"])
    color: str = Field(default="", max_length=30, examples=["Black"])
    brand: str = Field(default="", max_length=60, examples=["Apple"])
    location: str = Field(default="", max_length=200, examples=["Central Library, 2nd floor"])
    date: Optional[Date] = None
    status: ReportStatus = "open"
    user_id: Optional[str] = Field(default=None, max_length=64)


class MatchRequest(BaseModel):
    """Score one report against a list of candidate reports (no database access)."""

    model_config = ConfigDict(extra="forbid")

    item: Report
    candidates: List[Report] = Field(default_factory=list, max_length=500)
    limit: int = Field(default=6, ge=1, le=50)
    min_score: int = Field(default=35, ge=0, le=99)


class SignalScore(BaseModel):
    key: str
    label: str
    weight: float
    value: int = Field(ge=0, le=100)


class SuggestedMatch(BaseModel):
    item_id: str
    title: str
    type: ReportType
    score: int = Field(ge=0, le=99)
    label: Literal["Strong match", "Good match", "Possible match"]
    reasons: List[str]
    breakdown: List[SignalScore]
    verified_ownership: Literal[False] = False  # a match is never proof of ownership


class MatchResponse(BaseModel):
    result_type: Literal["suggested_matches"] = "suggested_matches"
    disclaimer: str = DISCLAIMER
    engine: str
    item_id: str
    count: int
    matches: List[SuggestedMatch]


class RefreshResponse(MatchResponse):
    saved_to_database: bool
    saved_count: int


class SupabaseStatus(BaseModel):
    configured: bool
    key_type: str
    reachable: Optional[bool] = None  # None = not checked (use /api/health?deep=true)
    detail: str = ""


class FirebaseStatus(BaseModel):
    configured: bool
    reachable: Optional[bool] = None
    detail: str = ""


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "findback-api"
    version: str
    engine: str
    python_version: str
    supabase: SupabaseStatus
    firebase: Optional[FirebaseStatus] = None

