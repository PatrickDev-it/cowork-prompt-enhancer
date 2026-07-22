#!/usr/bin/env python3
"""Reproducible cowork-eval/v1 runner with deterministic primary metrics."""

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE_DIR = ROOT / "server" / "modules" / "prompt_enhancer"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ENGINE_DIR))

from engine import LLMEngine  # noqa: E402
from evaluation.metrics import score_output, summarize  # noqa: E402
import workflow  # noqa: E402

SCHEMA_VERSION = "cowork-eval/v1"
DATASET = ROOT / "evaluation" / "datasets" / "v1" / "cases.jsonl"
MANIFEST = ROOT / "evaluation" / "datasets" / "v1" / "manifest.json"
FULL_STRATEGIES = ("raw", "thin", "compiler", "field_loop", "compiler_grounded")
CORE_STRATEGIES = ("raw", "thin", "compiler", "field_loop")


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_cases(path: Path = DATASET) -> list[dict]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    validate_dataset(rows, read_json(MANIFEST))
    return rows


def validate_dataset(rows: list[dict], manifest: dict) -> None:
    required = {
        "id",
        "category",
        "original_request",
        "explicit_requirements",
        "forbidden_specificity",
        "acceptable_inferences",
        "contradiction_markers",
        "expected_sections",
        "ambiguity",
        "freshness",
        "ambiguity_resolution_markers",
        "project_context_fixture",
        "grounding",
    }
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"manifest schema must be {SCHEMA_VERSION}")
    if len(rows) != manifest.get("case_count"):
        raise ValueError("dataset case count does not match manifest")
    identifiers = [row.get("id") for row in rows]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("dataset case IDs must be unique")
    counts: dict[str, int] = {}
    for row in rows:
        if set(row) != required:
            raise ValueError(
                f"{row.get('id', '<unknown>')} does not match the v1 case contract"
            )
        if not row["original_request"].strip() or not row["explicit_requirements"]:
            raise ValueError(f"{row['id']} has no request or explicit requirements")
        for requirement in row["explicit_requirements"]:
            if (
                set(requirement) != {"text", "anchors"}
                or not requirement["text"]
                or not requirement["anchors"]
            ):
                raise ValueError(f"{row['id']} has an invalid explicit requirement")
        grounding = row["grounding"]
        if grounding is not None:
            if not grounding.get("query") or not grounding.get("sources"):
                raise ValueError(f"{row['id']} has invalid grounding provenance")
            for source in grounding["sources"]:
                if not all(
                    source.get(name)
                    for name in ("url", "retrieved_at", "fact", "anchors")
                ):
                    raise ValueError(f"{row['id']} has incomplete grounding provenance")
        counts[row["category"]] = counts.get(row["category"], 0) + 1
    if counts != manifest.get("categories"):
        raise ValueError("dataset categories do not match manifest")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def gpu_metadata() -> list[dict]:
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    return [
        {"name": values[0].strip(), "driver": values[1].strip()}
        for line in output.splitlines()
        if len(values := line.split(",", 1)) == 2
    ]


def provider_identity(engine: LLMEngine) -> dict:
    config = engine.config
    assert config is not None
    model_path = Path(config.model)
    if config.profile == "mock":
        artifact = ENGINE_DIR / "providers" / "mock.py"
        checksum = sha256(artifact)
        model = "cowork-deterministic-v1"
    elif model_path.is_file():
        checksum = sha256(model_path)
        model = model_path.name
    else:
        checksum = None
        model = model_path.name or config.model
    return {"profile": config.profile, "model": model, "artifact_sha256": checksum}


def grounding_text(case: dict) -> str:
    grounding = case.get("grounding")
    if not grounding:
        return ""
    lines = [f"Query: {grounding['query']}"]
    for source in grounding["sources"]:
        lines.append(
            f"Source: {source['url']}\nRetrieved: {source['retrieved_at']}\nVerified fact: {source['fact']}"
        )
    return "\n\n".join(lines)


@contextmanager
def strategy_environment(value: str):
    previous = os.environ.get("COWORK_PROMPT_ENHANCER_STRATEGY")
    os.environ["COWORK_PROMPT_ENHANCER_STRATEGY"] = value
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("COWORK_PROMPT_ENHANCER_STRATEGY", None)
        else:
            os.environ["COWORK_PROMPT_ENHANCER_STRATEGY"] = previous


def execute_strategy(engine: LLMEngine, case: dict, strategy: str) -> tuple[str, dict]:
    request = case["original_request"]
    if strategy == "raw":
        return request, {"generation_mode": "raw", "grounded": False}
    if strategy == "thin":
        prompt = (
            "Rewrite the request once as a concise, execution-ready prompt. Preserve every stated requirement, "
            "do not invent technologies, and return only the rewritten prompt.\n\n"
            f"REQUEST:\n{request}\nCompile the REQUEST"
        )
        return engine.generate(prompt, max_new_tokens=1024), {
            "generation_mode": "thin_single_pass",
            "grounded": False,
        }

    selected = "field_loop" if strategy == "field_loop" else "compiler"
    original_grounding = workflow.gather_grounding
    try:
        if strategy == "compiler_grounded":
            fixture = grounding_text(case)
            workflow.gather_grounding = lambda _request, _flag: fixture
        with strategy_environment(selected):
            result = workflow.run_enhancement(
                engine,
                request,
                "standard",
                search=False,
                project_context=case.get("project_context_fixture") or "",
            )
    finally:
        workflow.gather_grounding = original_grounding
    return result["compiled_prompt"], result["debug"]


def run_case(engine: LLMEngine, case: dict, strategy: str) -> dict:
    engine.reset_metrics()
    started = time.perf_counter()
    output = ""
    error = None
    debug = {"generation_mode": strategy, "grounded": False}
    try:
        output, debug = execute_strategy(engine, case, strategy)
    except Exception as exc:
        error = {
            "type": type(exc).__name__,
            "code": getattr(exc, "code", "evaluation_error"),
        }
    total_ms = round((time.perf_counter() - started) * 1000, 3)
    calls = engine.snapshot_metrics()
    mode = str(debug.get("generation_mode", ""))
    compiler_requested = strategy in {"compiler", "compiler_grounded"}
    fallback_used = compiler_requested and mode == "single_generic_prompt_template"
    success = bool(output.strip()) and error is None
    grounding = case.get("grounding") if strategy == "compiler_grounded" else None
    return {
        "schema_version": SCHEMA_VERSION,
        "case_id": case["id"],
        "category": case["category"],
        "strategy": strategy,
        "status": "success" if success else "failed",
        "error": error,
        "output": output,
        "generation_mode": mode,
        "compiler_success": bool(
            compiler_requested and mode.startswith("compiler_") and success
        ),
        "fallback_used": fallback_used,
        "fallback_delivered_success": bool(fallback_used and success),
        "parse_recovery": bool(fallback_used and success),
        "search_activated": bool(debug.get("grounded")),
        "provenance": grounding,
        "provider_calls": calls,
        "timing": {
            "queue_ms": round(sum(call["queue_ms"] for call in calls), 3),
            "generation_ms": round(sum(call["generation_ms"] for call in calls), 3),
            "total_ms": total_ms,
        },
        "metrics": score_output(case, output),
    }


def select_cases(
    rows: list[dict], tier: str, case_ids: list[str], max_cases: int | None
) -> list[dict]:
    selected = rows
    if tier == "stratified":
        seen = set()
        selected = []
        for row in rows:
            if row["category"] not in seen:
                selected.append(row)
                seen.add(row["category"])
    if case_ids:
        requested = set(case_ids)
        selected = [row for row in selected if row["id"] in requested]
        missing = requested - {row["id"] for row in selected}
        if missing:
            raise ValueError(
                f"unknown or tier-excluded case IDs: {', '.join(sorted(missing))}"
            )
    return selected[:max_cases] if max_cases else selected


def write_report(path: Path, metadata: dict, summary: dict) -> None:
    lines = [
        f"# Benchmark report: {metadata['run_id']}",
        "",
        "## Methodology",
        "",
        f"`{SCHEMA_VERSION}` uses deterministic anchor, contradiction, specificity, ambiguity, structure and "
        "executability checks. These automated metrics are primary evidence; no model-assisted or human judge was used.",
        "",
        "## Dataset and environment",
        "",
        f"- Tier: `{metadata['tier']}` ({metadata['case_count']} cases; {', '.join(metadata['categories'])}).",
        f"- Provider: `{metadata['provider']['profile']}` / `{metadata['provider']['model']}`.",
        f"- Benchmark commit: `{metadata['benchmark_commit']}`.",
        "- Raw evidence: [`records.jsonl`](records.jsonl); environment: [`environment.json`](environment.json); "
        "machine summary: [`summary.json`](summary.json).",
        "",
        "## Deterministic results",
        "",
        "| Strategy | Cases | Recall | Precision | Contradiction | Invented specificity | Structure | Executability | Fallback | p50 ms | p95 ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for strategy, values in summary["strategies"].items():
        lines.append(
            f"| `{strategy}` | {values['cases']} | {values['explicit_requirement_recall']:.3f} | "
            f"{values['explicit_requirement_precision']:.3f} | {values['contradiction_rate']:.3f} | "
            f"{values['invented_specificity_rate']:.3f} | {values['structural_validity']:.3f} | "
            f"{values['executability']:.3f} | {values['fallback_rate']:.3f} | "
            f"{values['latency_ms']['p50']:.1f} | {values['latency_ms']['p95']:.1f} |"
        )
    lines.extend(
        [
            "",
            "Compiler success and fallback-delivered success are stored separately in `summary.json`; a successful "
            "fallback is never counted as compiler success.",
            "",
            "## Limitations",
            "",
            "- String anchors are transparent and reproducible but do not measure semantic paraphrases.",
            "- Precision covers tracked explicit requirements versus tracked contradictions/specificity, not every possible claim.",
            "- The executability rubric is deterministic and auditable; it is not human preference or proof of task success.",
            "- Mock results validate the harness and complete comparison, not real-model quality.",
            "- The stratified local tier is an eight-case reference and must not be presented as a full-corpus result.",
            "- Grounding uses embedded, timestamped fixtures; reference runs perform no live retrieval.",
            "- No human evaluation results are claimed. The blinded protocol is available in `evaluation/README.md`.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile", choices=("mock", "local", "openai-compatible"), default="mock"
    )
    parser.add_argument("--tier", choices=("full", "stratified"), default="full")
    parser.add_argument("--strategies", default=",".join(FULL_STRATEGIES))
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--max-cases", type=int)
    parser.add_argument("--run-id")
    parser.add_argument(
        "--output", type=Path, default=ROOT / ".artifacts" / "benchmark" / "mock"
    )
    parser.add_argument("--benchmark-commit")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    strategies = tuple(
        item.strip() for item in args.strategies.split(",") if item.strip()
    )
    unknown = set(strategies) - set(FULL_STRATEGIES)
    if unknown:
        raise ValueError(f"unsupported strategies: {', '.join(sorted(unknown))}")
    if args.tier == "stratified" and strategies == FULL_STRATEGIES:
        strategies = CORE_STRATEGIES
    output = args.output.resolve()
    if output.exists():
        if not args.overwrite:
            raise FileExistsError(
                f"output already exists: {output}; pass --overwrite to replace it"
            )
        shutil.rmtree(output)
    output.mkdir(parents=True)

    os.environ["COWORK_PROFILE"] = args.profile
    os.environ["COWORK_PROMPT_ENHANCER_SEARCH"] = "off"
    engine = LLMEngine()
    cases = select_cases(load_cases(), args.tier, args.case, args.max_cases)
    started = utc_now()
    records = []
    for case in cases:
        for strategy in strategies:
            if strategy == "compiler_grounded" and case.get("grounding") is None:
                continue
            records.append(run_case(engine, case, strategy))

    identity = provider_identity(engine)
    metadata = {
        "schema_version": SCHEMA_VERSION,
        "benchmark_version": read_json(MANIFEST)["benchmark_version"],
        "run_id": args.run_id or f"{args.profile}-{args.tier}-v1",
        "started_at": started,
        "completed_at": utc_now(),
        "benchmark_commit": args.benchmark_commit or git_commit(),
        "tier": args.tier,
        "case_count": len(cases),
        "record_count": len(records),
        "categories": sorted({case["category"] for case in cases}),
        "strategies": list(strategies),
        "provider": identity,
    }
    summary = {**metadata, "strategies": summarize(records)}
    environment = {
        **metadata,
        "runtime": {"python": platform.python_version()},
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
        },
        "gpu": gpu_metadata(),
        "live_retrieval": False,
        "judge": "deterministic_only",
    }
    (output / "records.jsonl").write_text(
        "".join(
            json.dumps(record, ensure_ascii=True, sort_keys=True) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (output / "environment.json").write_text(
        json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    write_report(output / "report.md", metadata, summary)
    display_output = (
        str(output.relative_to(ROOT)) if output.is_relative_to(ROOT) else output.name
    )
    print(
        json.dumps(
            {
                "ok": True,
                "output": display_output,
                "records": len(records),
                "provider": identity,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
