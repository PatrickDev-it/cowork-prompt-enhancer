import pytest

from evaluation.metrics import percentile, score_output, summarize


@pytest.fixture
def case():
    return {
        "explicit_requirements": [
            {"text": "Add typed input.", "anchors": ["typed", "input"]},
            {"text": "Run tests.", "anchors": ["tests"]},
        ],
        "forbidden_specificity": ["VendorCloud"],
        "acceptable_inferences": ["input validation"],
        "contradiction_markers": ["skip tests"],
        "expected_sections": ["Requirements", "Validation"],
        "ambiguity": True,
        "ambiguity_resolution_markers": ["confirm"],
        "grounding": None,
    }


def test_score_output_is_deterministic_and_auditable(case):
    output = "Implement typed input.\n# Requirements\nRun tests.\n# Validation\nConfirm the format with input validation."
    score = score_output(case, output)
    assert score["explicit_requirement_recall"] == 1
    assert score["explicit_requirement_precision"] == 1
    assert score["structural_validity"] == 1
    assert score["unresolved_ambiguity"] is False
    assert score["facts"]["explicit"] == ["Add typed input.", "Run tests."]


def test_tracked_hallucination_reduces_precision_and_executability(case):
    score = score_output(case, "Implement typed input with VendorCloud and skip tests.")
    assert score["invented_specificity_hits"] == ["VendorCloud"]
    assert score["contradiction_hits"] == ["skip tests"]
    assert score["explicit_requirement_precision"] < 1
    assert score["executability_checks"]["no_tracked_hallucination"] is False


def test_summary_separates_compiler_and_fallback_success(case):
    metric = score_output(
        case,
        "Implement typed input and tests with Requirements and Validation; confirm it.",
    )
    record = {
        "strategy": "compiler",
        "metrics": metric,
        "provider_calls": [],
        "compiler_success": False,
        "fallback_delivered_success": True,
        "fallback_used": True,
        "parse_recovery": True,
        "search_activated": False,
        "timing": {"total_ms": 4},
    }
    result = summarize([record])["compiler"]
    assert result["compiler_success_rate"] == 0
    assert result["fallback_delivered_success_rate"] == 1
    assert result["fallback_rate"] == 1


def test_percentile_uses_nearest_rank():
    assert percentile([1, 2, 3, 4], 0.5) == 2
    assert percentile([1, 2, 3, 4], 0.95) == 4
