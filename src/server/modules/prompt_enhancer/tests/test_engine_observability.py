"""Credential-free provider-call observations used by the evaluation pipeline."""

import threading

from config import ProviderConfig
from engine import LLMEngine
from providers import ProviderContextError


def mock_config(scenario: str = "success") -> ProviderConfig:
    return ProviderConfig("mock", "mock://offline", "cowork-deterministic-v1", 1, scenario)


def test_engine_records_tokens_and_timing_for_each_call():
    engine = LLMEngine(config=mock_config())
    output = engine.generate("REQUEST:\nBuild a typed API\nCompile the REQUEST")

    metrics = engine.snapshot_metrics()
    assert output
    assert len(metrics) == 1
    assert metrics[0]["success"] is True
    assert metrics[0]["prompt_tokens"] > 0
    assert metrics[0]["completion_tokens"] > 0
    assert metrics[0]["generation_ms"] >= 0
    assert metrics[0]["queue_ms"] == 0
    assert "credential" not in str(metrics).lower()


def test_engine_records_context_retries_and_can_reset():
    engine = LLMEngine(config=mock_config("context_overflow"))
    try:
        engine.generate("x" * 500, max_new_tokens=512)
    except ProviderContextError:
        pass

    metrics = engine.snapshot_metrics()
    assert len(metrics) == 5
    assert all(item["error_code"] == "provider_context_overflow" for item in metrics)
    engine.reset_metrics()
    assert engine.snapshot_metrics() == []


def test_engine_observation_reduces_model_paths_to_artifact_name():
    engine = LLMEngine(config=mock_config())
    engine.model_source = r"C:\private\models\fixture.gguf"
    engine.generate("REQUEST:\nBuild a test\nCompile the REQUEST")

    metrics = engine.snapshot_metrics()
    assert metrics[0]["model"] == "fixture.gguf"
    assert "private" not in str(metrics)


def test_engine_observations_are_isolated_between_worker_threads():
    engine = LLMEngine(config=mock_config())
    observed: list[list[dict]] = []

    def generate(request: str) -> None:
        engine.reset_metrics()
        engine.generate(f"REQUEST:\n{request}\nCompile the REQUEST")
        observed.append(engine.snapshot_metrics())

    threads = [threading.Thread(target=generate, args=(f"request-{index}",)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(observed) == 2
    assert all(len(calls) == 1 and calls[0]["call"] == 1 for calls in observed)
