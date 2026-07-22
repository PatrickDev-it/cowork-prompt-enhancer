import csv
import json

import pytest

from evaluation.human_review import export_review, import_review


def write_records(path):
    rows = [
        {"case_id": "case-1", "strategy": "raw", "output": "first"},
        {"case_id": "case-1", "strategy": "compiler", "output": "second"},
    ]
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def complete_review(path):
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row.update(
            reviewer_id="reviewer-alpha",
            requirement_preservation="4",
            non_invention="5",
            executability="4",
        )
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def test_blinded_export_hides_strategy_and_import_validates(tmp_path):
    records = tmp_path / "records.jsonl"
    review = tmp_path / "review.csv"
    mapping = tmp_path / "mapping.json"
    imported = tmp_path / "imported.jsonl"
    write_records(records)
    export_review(records, review, mapping)
    assert "strategy" not in review.read_text(encoding="utf-8").splitlines()[0]
    complete_review(review)
    rows = import_review(review, mapping, imported)
    assert len(rows) == 2
    assert {row["strategy"] for row in rows} == {"raw", "compiler"}


def test_import_rejects_missing_reviewer_identity(tmp_path):
    records = tmp_path / "records.jsonl"
    review = tmp_path / "review.csv"
    mapping = tmp_path / "mapping.json"
    write_records(records)
    export_review(records, review, mapping)
    with pytest.raises(ValueError, match="reviewer_id"):
        import_review(review, mapping, tmp_path / "out.jsonl")
