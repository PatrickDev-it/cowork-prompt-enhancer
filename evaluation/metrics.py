"""Auditable deterministic metrics for cowork-eval/v1."""

import math
import re
from collections.abc import Iterable

_ACTION = re.compile(
    r"\b(add|analyze|build|configure|create|debug|define|design|draft|fix|implement|investigate|"
    r"migrate|prepare|refactor|research|review|run|test|validate|write)\b",
    re.IGNORECASE,
)
_VALIDATION = re.compile(
    r"\b(test|tests|validate|validation|verify|verification|acceptance|check|checks)\b",
    re.IGNORECASE,
)


def contains(text: str, marker: str) -> bool:
    """Case-insensitive phrase match with whitespace normalization."""

    normalized = " ".join(text.casefold().split())
    return " ".join(marker.casefold().split()) in normalized


def marker_hits(text: str, markers: Iterable[str]) -> list[str]:
    return [marker for marker in markers if contains(text, marker)]


def requirement_matches(text: str, requirements: list[dict]) -> list[dict]:
    matches = []
    for requirement in requirements:
        anchors = requirement["anchors"]
        matched = [anchor for anchor in anchors if contains(text, anchor)]
        matches.append(
            {
                "text": requirement["text"],
                "anchors": anchors,
                "matched_anchors": matched,
                "matched": bool(matched) and len(matched) == len(anchors),
            }
        )
    return matches


def expected_section_matches(text: str, sections: list[str]) -> list[str]:
    return [section for section in sections if contains(text, section)]


def score_output(case: dict, output: str) -> dict:
    requirements = requirement_matches(output, case["explicit_requirements"])
    matched_requirements = sum(item["matched"] for item in requirements)
    requirement_count = len(requirements)
    forbidden = marker_hits(output, case["forbidden_specificity"])
    contradictions = marker_hits(output, case["contradiction_markers"])
    ambiguity_markers = marker_hits(output, case["ambiguity_resolution_markers"])
    sections = expected_section_matches(output, case["expected_sections"])
    grounding = case.get("grounding") or {}
    grounded_facts = []
    for source in grounding.get("sources", []):
        anchors = source.get("anchors", [])
        grounded_facts.append(
            {
                "fact": source["fact"],
                "url": source["url"],
                "retrieved_at": source["retrieved_at"],
                "anchors": anchors,
                "matched": bool(anchors)
                and all(contains(output, anchor) for anchor in anchors),
            }
        )

    recall = matched_requirements / requirement_count if requirement_count else 1.0
    tracked_claims = matched_requirements + len(forbidden) + len(contradictions)
    precision = (
        matched_requirements / tracked_claims
        if tracked_claims
        else (1.0 if not output.strip() else 0.0)
    )
    structural_validity = (
        len(sections) / len(case["expected_sections"])
        if case["expected_sections"]
        else 1.0
    )
    unresolved_ambiguity = bool(case["ambiguity"] and not ambiguity_markers)
    executable_checks = {
        "actionable": bool(_ACTION.search(output)),
        "explicit_recall": recall >= 2 / 3,
        "structured": structural_validity >= 1 / 2,
        "validation_present": bool(_VALIDATION.search(output)),
        "no_tracked_hallucination": not forbidden and not contradictions,
    }
    executability = sum(executable_checks.values()) / len(executable_checks)

    return {
        "explicit_requirement_recall": round(recall, 6),
        "explicit_requirement_precision": round(precision, 6),
        "requirement_matches": requirements,
        "contradiction_hits": contradictions,
        "contradiction_rate": round(
            len(contradictions) / max(1, len(case["contradiction_markers"])), 6
        ),
        "invented_specificity_hits": forbidden,
        "invented_specificity_rate": round(
            len(forbidden) / max(1, len(case["forbidden_specificity"])), 6
        ),
        "ambiguity_resolution_hits": ambiguity_markers,
        "unresolved_ambiguity": unresolved_ambiguity,
        "expected_section_matches": sections,
        "structural_validity": round(structural_validity, 6),
        "executability": round(executability, 6),
        "executability_checks": executable_checks,
        "facts": {
            "explicit": [item["text"] for item in requirements if item["matched"]],
            "conservative_inferences": marker_hits(
                output, case["acceptable_inferences"]
            ),
            "externally_grounded": grounded_facts,
        },
    }


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return round(ordered[index], 3)


def summarize(records: list[dict]) -> dict:
    by_strategy: dict[str, list[dict]] = {}
    for record in records:
        by_strategy.setdefault(record["strategy"], []).append(record)

    result = {}
    for strategy, items in sorted(by_strategy.items()):
        metric_rows = [item["metrics"] for item in items]
        provider_calls = [call for item in items for call in item["provider_calls"]]

        def average(name: str, metric_rows: list[dict] = metric_rows) -> float:
            return round(
                sum(float(row[name]) for row in metric_rows) / len(metric_rows), 6
            )

        result[strategy] = {
            "cases": len(items),
            "explicit_requirement_recall": average("explicit_requirement_recall"),
            "explicit_requirement_precision": average("explicit_requirement_precision"),
            "contradiction_rate": average("contradiction_rate"),
            "invented_specificity_rate": average("invented_specificity_rate"),
            "unresolved_ambiguity_rate": round(
                sum(bool(row["unresolved_ambiguity"]) for row in metric_rows)
                / len(metric_rows),
                6,
            ),
            "structural_validity": average("structural_validity"),
            "executability": average("executability"),
            "compiler_success_rate": round(
                sum(item["compiler_success"] for item in items) / len(items), 6
            ),
            "fallback_delivered_success_rate": round(
                sum(item["fallback_delivered_success"] for item in items) / len(items),
                6,
            ),
            "fallback_rate": round(
                sum(item["fallback_used"] for item in items) / len(items), 6
            ),
            "parse_recovery_rate": round(
                sum(item["parse_recovery"] for item in items) / len(items), 6
            ),
            "search_activation_rate": round(
                sum(item["search_activated"] for item in items) / len(items), 6
            ),
            "latency_ms": {
                "p50": percentile([item["timing"]["total_ms"] for item in items], 0.5),
                "p95": percentile([item["timing"]["total_ms"] for item in items], 0.95),
            },
            "tokens": {
                "prompt": sum(call["prompt_tokens"] for call in provider_calls),
                "completion": sum(call["completion_tokens"] for call in provider_calls),
            },
            "timing_ms": {
                "queue": round(sum(call["queue_ms"] for call in provider_calls), 3),
                "generation": round(
                    sum(call["generation_ms"] for call in provider_calls), 3
                ),
            },
            "provider_calls": len(provider_calls),
        }
    return result
