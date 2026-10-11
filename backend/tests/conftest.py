"""Shared test helpers for the FindBack Python backend."""
import json
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))  # so `import app` works when running `pytest` from backend/

FIXTURES = Path(__file__).resolve().parent / "fixtures"

LOST_PHONE = {
    "id": "11111111-1111-4111-8111-111111111111",
    "user_id": "owner-a",
    "type": "lost",
    "status": "open",
    "title": "Black iPhone 13 with blue silicone case",
    "description": "Lost my black iPhone in a blue case. Small crack at the bottom.",
    "category": "Electronics",
    "color": "Black",
    "brand": "Apple",
    "location": "Central Library, 2nd floor",
    "date": "2026-10-01",
}
FOUND_PHONE = {
    "id": "22222222-2222-4222-8222-222222222222",
    "user_id": "owner-b",
    "type": "found",
    "status": "open",
    "title": "Black Apple smartphone in blue cover",
    "description": "Found a black mobile with a blue cover under a desk in the library.",
    "category": "Electronics",
    "color": "Black",
    "brand": "Apple",
    "location": "Library 2nd floor",
    "date": "2026-10-02",
}
FOUND_BOTTLE = {
    "id": "33333333-3333-4333-8333-333333333333",
    "user_id": "owner-c",
    "type": "found",
    "status": "open",
    "title": "Blue steel water bottle",
    "description": "Milton bottle with stickers left in the gym.",
    "category": "Water Bottles",
    "color": "Blue",
    "brand": "Milton",
    "location": "Gym",
    "date": "2026-10-02",
}


@pytest.fixture
def parity():
    return json.loads((FIXTURES / "matching_parity.json").read_text(encoding="utf-8"))


@pytest.fixture
def lost_phone():
    return dict(LOST_PHONE)


@pytest.fixture
def found_phone():
    return dict(FOUND_PHONE)


@pytest.fixture
def found_bottle():
    return dict(FOUND_BOTTLE)
