"""
The Python engine must give EXACTLY the same results as the browser engine
(src/lib/matching.js). The expected values in fixtures/matching_parity.json were
produced by the JavaScript engine (npm run gen:parity); tests/parity.test.js checks
the JavaScript side against the same file.
"""
from app.matching import find_matches_for, score_match, tokenize


def test_fixture_covers_a_wide_range_of_scores(parity):
    scores = [p["score"] for p in parity["pairs"]]
    assert len(scores) >= 100
    assert min(scores) < 20 and max(scores) >= 95


def test_tokenize_matches_javascript(parity):
    for case in parity["tokenize"]:
        assert tokenize(case["text"]) == case["tokens"], case["text"]


def test_every_pair_matches_javascript_exactly(parity):
    items = {i["id"]: i for i in parity["items"]}
    for pair in parity["pairs"]:
        result = score_match(items[pair["a"]], items[pair["b"]])
        label = f'{pair["a"]} vs {pair["b"]}'
        assert result["score"] == pair["score"], label
        assert result["reasons"] == pair["reasons"], label
        assert result["breakdown"] == pair["breakdown"], label
        assert score_match(items[pair["b"]], items[pair["a"]])["score"] == pair["reverse_score"], label


def test_ranked_match_lists_match_javascript(parity):
    for expected in parity["find_matches"]:
        item = next(i for i in parity["items"] if i["id"] == expected["item"])
        got = [{"id": m["item"]["id"], "score": m["score"]} for m in find_matches_for(item, parity["items"], 20)]
        assert got == expected["results"], expected["item"]
