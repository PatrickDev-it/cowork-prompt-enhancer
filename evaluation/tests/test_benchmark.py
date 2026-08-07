import json

from config import ProviderConfig
from engine import LLMEngine

from evaluation.benchmark import load_cases, main, run_case


def test_mock_compiler_record_tracks_outcome_tokens_and_metrics(monkeypatch):
    monkeypatch.setenv("COWORK_PROFILE", "mock")
    engine = LLMEngine(
        config=ProviderConfig("mock", "mock://offline", "cowork-deterministic-v1", 2)
    )
    record = run_case(engine, load_cases()[0], "compiler")
    assert record["status"] == "success"
    assert record["compiler_success"] is True
    assert record["fallback_used"] is False
    assert record["provider_calls"][0]["prompt_tokens"] > 0
    assert record["metrics"]["facts"]["explicit"]


def test_malformed_compiler_output_tracks_fallback_parse_recovery(monkeypatch):
    monkeypatch.setenv("COWORK_PROFILE", "mock")
    engine = LLMEngine(
        config=ProviderConfig(
            "mock", "mock://offline", "cowork-deterministic-v1", 2, "malformed"
        )
    )
    record = run_case(engine, load_cases()[0], "compiler")
    assert record["status"] == "success"
    assert record["compiler_success"] is False
    assert record["fallback_used"] is True
    assert record["fallback_delivered_success"] is True
    assert record["parse_recovery"] is True


def test_grounded_record_retains_query_urls_and_timestamp(monkeypatch):
    monkeypatch.setenv("COWORK_PROFILE", "mock")
    engine = LLMEngine(
        config=ProviderConfig("mock", "mock://offline", "cowork-deterministic-v1", 2)
    )
    case = next(case for case in load_cases() if case["grounding"])
    record = run_case(engine, case, "compiler_grounded")
    assert record["search_activated"] is True
    assert record["provenance"]["query"]
    assert record["provenance"]["sources"][0]["url"].startswith("https://")
    assert record["provenance"]["sources"][0]["retrieved_at"].endswith("Z")


def test_runner_writes_machine_readable_evidence(tmp_path, monkeypatch):
    output = tmp_path / "run"
    monkeypatch.delenv("COWORK_PROMPT_ENHANCER_PROVIDER", raising=False)
    assert (
        main(
            [
                "--profile",
                "mock",
                "--max-cases",
                "1",
                "--strategies",
                "raw,compiler",
                "--output",
                str(output),
            ]
        )
        == 0
    )
    records = [
        json.loads(line) for line in (output / "records.jsonl").read_text().splitlines()
    ]
    assert [record["strategy"] for record in records] == ["raw", "compiler"]
    assert (output / "summary.json").is_file()
    assert (output / "environment.json").is_file()
    assert (
        "No human evaluation results are claimed" in (output / "report.md").read_text()
    )
