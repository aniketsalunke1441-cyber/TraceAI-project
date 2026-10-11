"""Unit tests for the deterministic matching engine (app/matching.py)."""
from app.matching import (
    MIN_MATCH_SCORE,
    WEIGHTS,
    find_matches_for,
    js_round,
    match_label,
    score_match,
    stem,
    tokenize,
)


def test_tokenize_normalises_text_and_maps_synonyms():
    tokens = tokenize("Lost my iPhone and a Mobile near the Cafeteria!")
    assert tokens == ["phone", "phone", "canteen"]  # stop-words dropped, synonyms mapped


def test_tokenize_handles_empty_and_none():
    assert tokenize("") == []
    assert tokenize(None) == []


def test_stemming_rules():
    assert stem("batteries") == "battery"
    assert stem("boxes") == "box"
    assert stem("keys") == "key"
    assert stem("glass") == "glass"  # "ss" endings are kept


def test_js_round_rounds_halves_up_like_javascript():
    assert js_round(2.5) == 3 and js_round(3.5) == 4  # Python's round() would give 2 and 4
    assert js_round(0.49) == 0


def test_same_item_described_differently_is_a_strong_match(lost_phone, found_phone):
    result = score_match(lost_phone, found_phone)
    assert result["score"] >= 75
    assert match_label(result["score"]) == "Strong match"
    reasons = " | ".join(result["reasons"])
    for expected in ("Similar description", "Same category: Electronics", "Same colour (Black)", "Same brand: Apple", "Nearby location", "Found 1 day after it was lost"):
        assert expected in reasons


def test_breakdown_explains_every_signal(lost_phone, found_phone):
    breakdown = score_match(lost_phone, found_phone)["breakdown"]
    assert [b["key"] for b in breakdown] == ["text", "category", "location", "date", "color", "brand"]
    assert all(0 <= b["value"] <= 100 for b in breakdown)
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9


def test_unrelated_items_score_below_threshold(lost_phone, found_bottle):
    assert score_match(lost_phone, found_bottle)["score"] < MIN_MATCH_SCORE


def test_score_is_deterministic_and_symmetric(lost_phone, found_phone):
    first = score_match(lost_phone, found_phone)
    assert score_match(lost_phone, found_phone) == first
    assert score_match(found_phone, lost_phone)["score"] == first["score"]
    assert 0 <= first["score"] <= 99


def test_found_long_before_lost_scores_lower(lost_phone, found_phone):
    early = dict(found_phone, date="2026-09-01")
    assert score_match(lost_phone, early)["score"] < score_match(lost_phone, found_phone)["score"]


def test_similar_colour_family_gives_partial_credit(lost_phone, found_phone):
    navy = score_match(dict(lost_phone, color="Navy"), dict(found_phone, color="Blue"))
    assert "Similar colour (Navy / Blue)" in navy["reasons"]
    colour = next(b for b in navy["breakdown"] if b["key"] == "color")
    assert colour["value"] == 60


def test_missing_optional_fields_do_not_crash(lost_phone):
    minimal = {"id": "x", "type": "found", "title": "Phone", "status": "open", "user_id": "z"}
    result = score_match(lost_phone, minimal)
    assert 0 <= result["score"] <= 99


def test_find_matches_filters_and_sorts(lost_phone, found_phone, found_bottle):
    same_owner = dict(found_phone, id="same-owner", user_id=lost_phone["user_id"])
    resolved = dict(found_phone, id="resolved", status="resolved")
    other_lost = dict(lost_phone, id="other-lost", user_id="someone")
    results = find_matches_for(lost_phone, [lost_phone, found_bottle, same_owner, resolved, other_lost, found_phone])
    assert [m["item"]["id"] for m in results] == [found_phone["id"]]


def test_find_matches_respects_limit_and_min_score(lost_phone, found_phone):
    many = [dict(found_phone, id=f"f{i}", user_id=f"u{i}") for i in range(10)]
    assert len(find_matches_for(lost_phone, many, limit=3)) == 3
    assert find_matches_for(lost_phone, many, min_score=100) == []


def test_reports_without_owner_ids_are_still_compared(lost_phone, found_phone):
    a = dict(lost_phone, user_id=None)
    b = dict(found_phone, user_id=None)
    assert len(find_matches_for(a, [b])) == 1
