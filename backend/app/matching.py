"""
FindBack matching engine (Python)
=================================

Deterministic, explainable scoring of how likely a LOST report and a FOUND
report describe the same physical item.

It is a faithful port of the browser engine in ``src/lib/matching.js``: the two
produce *identical* scores, reasons and breakdowns. This is verified by
``backend/tests/test_parity.py`` and ``tests/parity.test.js`` against the shared
fixture ``backend/tests/fixtures/matching_parity.json``.

How a score is built
--------------------
1. Text normalisation – lower-case, punctuation removed, stop-words dropped,
   simple stemming, synonyms mapped to one word ("mobile"/"iphone" -> "phone").
2. Description similarity – title (counted twice) + description + brand become
   word-frequency vectors compared with cosine similarity.
3. Structured signals – category, colour (exact or same colour family), brand,
   overlap of the approximate locations, and how many days apart the reports are.
4. Weighted sum of the signals, stretched x1.15 and clamped to 0..99.

The result is a *suggested* match only. It is never proof of ownership: that is
established only when the item's reporter approves an ownership claim.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

ENGINE_VERSION = "findback-matching-1.0"

STOP_WORDS = frozenset(
    """a an and are as at be been but by for from has have i in is it its my of on or our that the this to was were with
    lost found near item please contact me if any someone left behind around inside outside very some one my we
    there here it's got get had did not no yes""".split()
)

# Words in the same group are treated as the same concept (first word is canonical).
SYNONYM_GROUPS: Tuple[Tuple[str, ...], ...] = (
    ("phone", "mobile", "smartphone", "iphone", "cellphone", "cell", "android", "handset"),
    ("wallet", "purse", "billfold", "cardholder"),
    ("bag", "backpack", "rucksack", "satchel", "schoolbag", "knapsack", "tote", "handbag"),
    ("earbud", "earbuds", "airpod", "airpods", "earphone", "earphones", "headphone", "headphones", "buds", "tws"),
    ("key", "keys", "keychain", "keyring", "fob"),
    ("laptop", "macbook", "chromebook", "thinkpad"),
    ("charger", "adapter", "adaptor", "cable", "charging"),
    ("id", "idcard", "identity", "icard", "badge"),
    ("card", "cards"),
    ("bottle", "flask", "sipper", "tumbler"),
    ("watch", "smartwatch", "wristwatch"),
    ("glasses", "spectacles", "specs", "sunglasses", "eyeglasses", "shades"),
    ("jacket", "hoodie", "sweatshirt", "coat", "sweater", "jumper"),
    ("umbrella", "brolly"),
    ("notebook", "diary", "journal", "register"),
    ("book", "textbook", "novel"),
    ("calculator", "calc"),
    ("ring", "band"),
    ("chain", "necklace", "pendant"),
    ("cover", "case", "pouch", "sleeve"),
    ("library", "lib"),
    ("canteen", "cafeteria", "cafe", "mess", "foodcourt"),
    ("auditorium", "hall", "theatre", "theater"),
    ("lab", "laboratory"),
    ("gate", "entrance"),
    ("parking", "carpark", "lot"),
    ("gym", "sports", "fitness"),
)

SYNONYMS: Dict[str, str] = {}
for _group in SYNONYM_GROUPS:
    for _word in _group:
        SYNONYMS[_word] = _group[0]  # later groups win, exactly like Map.set() in matching.js

COLOR_FAMILIES: Dict[str, str] = {
    "black": "dark",
    "gray": "neutral",
    "grey": "neutral",
    "silver": "neutral",
    "white": "light",
    "blue": "blue",
    "navy": "blue",
    "red": "red",
    "maroon": "red",
    "pink": "red",
    "green": "green",
    "yellow": "yellow",
    "gold": "yellow",
    "orange": "yellow",
    "purple": "purple",
    "brown": "brown",
    "beige": "brown",
}

WEIGHTS: Dict[str, float] = {"text": 0.35, "category": 0.2, "color": 0.12, "location": 0.15, "date": 0.13, "brand": 0.05}
MIN_MATCH_SCORE = 35
MAX_SCORE = 99

# JavaScript's \s also matches U+FEFF; include it so tokenisation is identical.
_NON_WORD = re.compile(r"[^a-z0-9\s﻿]")
_WHITESPACE = re.compile(r"[\s﻿]+")


def js_round(value: float) -> int:
    """Math.round() semantics (halves round up), unlike Python's banker's rounding."""
    return int(math.floor(value + 0.5))


def stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("es") and not word.endswith("ses"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def tokenize(text: Optional[str]) -> List[str]:
    """Normalise free text into comparable tokens."""
    cleaned = _NON_WORD.sub(" ", (text or "").lower())
    out: List[str] = []
    for word in _WHITESPACE.split(cleaned):
        if len(word) <= 1 or word in STOP_WORDS:
            continue
        stemmed = stem(word)
        out.append(SYNONYMS.get(word) or SYNONYMS.get(stemmed) or stemmed)
    return out


def _vectorize(tokens: Iterable[str]) -> Dict[str, int]:
    vec: Dict[str, int] = {}
    for t in tokens:
        vec[t] = vec.get(t, 0) + 1
    return vec


def cosine(a: Mapping[str, int], b: Mapping[str, int]) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for k, v in a.items():
        na += v * v
        if k in b:
            dot += v * b[k]
    for v in b.values():
        nb += v * v
    if not na or not nb:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _get(item: Mapping[str, Any], key: str) -> Any:
    value = item.get(key)
    return value if value is not None else ""


def _item_text(item: Mapping[str, Any]) -> str:
    # The title is repeated so it counts twice as much as the description.
    title = _get(item, "title")
    return f"{title} {title} {_get(item, 'description')} {_get(item, 'brand')}"


def _color_score(a: Optional[str], b: Optional[str]) -> Tuple[float, Optional[str]]:
    x = (a or "").lower().strip()
    y = (b or "").lower().strip()
    if not x or not y:
        return 0.5, None
    if x == y:
        return 1.0, f"Same colour ({a})"
    if x == "multicolor" or y == "multicolor":
        return 0.5, None
    if COLOR_FAMILIES.get(x) and COLOR_FAMILIES.get(x) == COLOR_FAMILIES.get(y):
        return 0.6, f"Similar colour ({a} / {b})"
    return 0.0, None


def _ordered_unique(values: Iterable[str]) -> List[str]:
    return list(dict.fromkeys(values))


def _location_score(a: Optional[str], b: Optional[str]) -> Tuple[float, List[str]]:
    ta = _ordered_unique(tokenize(a))
    tb = set(tokenize(b))
    if not ta or not tb:
        return 0.3, []
    shared = [t for t in ta if t in tb]
    score = len(shared) / min(len(ta), len(tb))
    return min(1.0, score), shared


def _parse_day(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = str(value).strip()
    try:
        if len(text) == 10:
            return datetime.fromisoformat(text)
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _date_score(lost: Mapping[str, Any], found: Mapping[str, Any]) -> Tuple[float, Optional[str]]:
    lost_day = _parse_day(lost.get("date"))
    found_day = _parse_day(found.get("date"))
    if lost_day is None or found_day is None:
        return 0.5, None
    days = js_round((found_day - lost_day).total_seconds() / 86400)
    if days < -2:
        return 0.05, None  # "found" well before it was lost -> unlikely
    gap = max(0, days)
    score = max(0.0, 1 - gap / 30)
    note = None
    if gap == 0:
        note = "Lost and found on the same day"
    elif gap <= 7:
        note = f"Found {gap} day{'s' if gap > 1 else ''} after it was lost"
    return score, note


def score_match(a: Mapping[str, Any], b: Mapping[str, Any]) -> Dict[str, Any]:
    """Score two reports. Returns {'score', 'reasons', 'breakdown'}."""
    lost, found = (a, b) if a.get("type") == "lost" else (b, a)
    reasons: List[str] = []

    tokens_a = tokenize(_item_text(a))
    tokens_b = tokenize(_item_text(b))
    text = cosine(_vectorize(tokens_a), _vectorize(tokens_b))
    tokens_b_set = set(tokens_b)
    shared_words = _ordered_unique(t for t in tokens_a if t in tokens_b_set)[:4]
    if shared_words:
        reasons.append("Similar description: " + ", ".join(shared_words))

    category = 1 if a.get("category") and a.get("category") == b.get("category") else 0
    if category:
        reasons.append(f"Same category: {a.get('category')}")

    color, color_note = _color_score(a.get("color"), b.get("color"))
    if color_note:
        reasons.append(color_note)

    brand_a, brand_b = a.get("brand") or "", b.get("brand") or ""
    brand = 1 if brand_a and brand_b and brand_a.strip().lower() == brand_b.strip().lower() else 0
    if brand:
        reasons.append(f"Same brand: {brand_a}")

    location, shared_places = _location_score(a.get("location"), b.get("location"))
    if shared_places:
        reasons.append("Nearby location: " + ", ".join(shared_places))

    date_score, date_note = _date_score(lost, found)
    if date_note:
        reasons.append(date_note)

    raw = (
        text * WEIGHTS["text"]
        + category * WEIGHTS["category"]
        + color * WEIGHTS["color"]
        + location * WEIGHTS["location"]
        + date_score * WEIGHTS["date"]
        + brand * WEIGHTS["brand"]
    )
    score = max(0, min(MAX_SCORE, js_round(raw * 115)))

    def pct(v: float) -> int:
        return js_round(v * 100)

    breakdown = [
        {"key": "text", "label": "Description", "weight": WEIGHTS["text"], "value": pct(text)},
        {"key": "category", "label": "Category", "weight": WEIGHTS["category"], "value": pct(category)},
        {"key": "location", "label": "Location", "weight": WEIGHTS["location"], "value": pct(location)},
        {"key": "date", "label": "Date", "weight": WEIGHTS["date"], "value": pct(date_score)},
        {"key": "color", "label": "Colour", "weight": WEIGHTS["color"], "value": pct(color)},
        {"key": "brand", "label": "Brand", "weight": WEIGHTS["brand"], "value": pct(brand)},
    ]
    return {"score": score, "reasons": reasons, "breakdown": breakdown}


def match_label(score: int) -> str:
    if score >= 75:
        return "Strong match"
    if score >= 55:
        return "Good match"
    return "Possible match"


def _same_owner(a: Mapping[str, Any], b: Mapping[str, Any]) -> bool:
    # Same rule as the browser engine; reports without an owner id are never treated as "same owner".
    return a.get("user_id") is not None and a.get("user_id") == b.get("user_id")


def find_matches_for(
    item: Mapping[str, Any],
    candidates: Iterable[Mapping[str, Any]],
    limit: int = 6,
    min_score: int = MIN_MATCH_SCORE,
) -> List[Dict[str, Any]]:
    """Best suggested matches for `item`: open reports of the opposite type from other users."""
    scored = []
    for other in candidates:
        if other.get("id") == item.get("id") or other.get("type") == item.get("type"):
            continue
        if other.get("status") != "open" or _same_owner(item, other):
            continue
        result = score_match(item, other)
        if result["score"] >= min_score:
            scored.append({"item": other, **result})
    scored.sort(key=lambda m: -m["score"])  # stable, like Array.prototype.sort
    return scored[:limit]
