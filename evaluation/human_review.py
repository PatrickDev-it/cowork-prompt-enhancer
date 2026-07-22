#!/usr/bin/env python3
"""Blinded human-review CSV exporter and validated importer."""

import argparse
import csv
import hashlib
import json
import random
from pathlib import Path

RATING_FIELDS = ("requirement_preservation", "non_invention", "executability")


def load_records(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def export_review(
    records_path: Path, review_path: Path, mapping_path: Path, seed: int = 20260722
) -> None:
    records = load_records(records_path)
    rows = []
    mapping = {"schema_version": "cowork-human-review/v1", "seed": seed, "outputs": {}}
    for record in records:
        digest = hashlib.sha256(
            f"{seed}:{record['case_id']}:{record['strategy']}".encode()
        ).hexdigest()[:16]
        output_id = f"output-{digest}"
        rows.append(
            {
                "reviewer_id": "",
                "output_id": output_id,
                "case_id": record["case_id"],
                "output": record["output"],
                "requirement_preservation": "",
                "non_invention": "",
                "executability": "",
                "notes": "",
            }
        )
        mapping["outputs"][output_id] = {
            "case_id": record["case_id"],
            "strategy": record["strategy"],
        }
    random.Random(seed).shuffle(rows)
    review_path.parent.mkdir(parents=True, exist_ok=True)
    with review_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    mapping_path.write_text(
        json.dumps(mapping, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def import_review(
    review_path: Path, mapping_path: Path, output_path: Path
) -> list[dict]:
    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    if mapping.get("schema_version") != "cowork-human-review/v1":
        raise ValueError("unsupported human-review mapping schema")
    imported = []
    seen = set()
    with review_path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            output_id = row.get("output_id", "")
            reviewer_id = row.get("reviewer_id", "").strip()
            if output_id in seen or output_id not in mapping["outputs"]:
                raise ValueError(f"unknown or duplicate output ID: {output_id}")
            if not reviewer_id or len(reviewer_id) > 64:
                raise ValueError(
                    "reviewer_id must be a non-empty pseudonym of at most 64 characters"
                )
            ratings = {}
            for field in RATING_FIELDS:
                try:
                    rating = int(row.get(field, ""))
                except ValueError as exc:
                    raise ValueError(f"{field} must be an integer from 1 to 5") from exc
                if rating < 1 or rating > 5:
                    raise ValueError(f"{field} must be an integer from 1 to 5")
                ratings[field] = rating
            seen.add(output_id)
            imported.append(
                {
                    "schema_version": "cowork-human-review/v1",
                    "reviewer_id": reviewer_id,
                    "output_id": output_id,
                    **mapping["outputs"][output_id],
                    "ratings": ratings,
                    "notes": row.get("notes", "").strip(),
                }
            )
    if seen != set(mapping["outputs"]):
        raise ValueError("review file is incomplete")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "".join(
            json.dumps(row, ensure_ascii=True, sort_keys=True) + "\n"
            for row in imported
        ),
        encoding="utf-8",
    )
    return imported


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export")
    export.add_argument("--records", type=Path, required=True)
    export.add_argument("--review", type=Path, required=True)
    export.add_argument("--mapping", type=Path, required=True)
    export.add_argument("--seed", type=int, default=20260722)
    load = commands.add_parser("import")
    load.add_argument("--review", type=Path, required=True)
    load.add_argument("--mapping", type=Path, required=True)
    load.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export":
        export_review(args.records, args.review, args.mapping, args.seed)
    else:
        import_review(args.review, args.mapping, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
