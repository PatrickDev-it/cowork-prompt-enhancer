import json
from collections import Counter
from pathlib import Path

from evaluation.benchmark import (
    DATASET,
    MANIFEST,
    SCHEMA_VERSION,
    load_cases,
    validate_dataset,
)


def test_dataset_is_balanced_and_contract_valid():
    cases = load_cases()
    assert len(cases) == 64
    assert Counter(case["category"] for case in cases) == {
        "implementation": 8,
        "debugging": 8,
        "refactoring": 8,
        "architecture": 8,
        "operations": 8,
        "data_ml": 8,
        "research": 8,
        "professional_writing": 8,
    }
    assert all(
        case["original_request"] and case["explicit_requirements"] for case in cases
    )


def test_grounding_provenance_is_timestamped_and_uses_https():
    grounded = [case for case in load_cases() if case["grounding"]]
    assert len(grounded) >= 4
    for case in grounded:
        for source in case["grounding"]["sources"]:
            assert source["url"].startswith("https://")
            assert source["retrieved_at"].endswith("Z")
            assert len(source["fact"].split()) < 80


def test_schema_and_manifest_are_versioned_json():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    schema_path = Path(DATASET.parent / "schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    assert manifest["schema_version"] == SCHEMA_VERSION
    assert schema["$id"].endswith("/evaluation/datasets/v1/schema.json")
    validate_dataset(load_cases(), manifest)
