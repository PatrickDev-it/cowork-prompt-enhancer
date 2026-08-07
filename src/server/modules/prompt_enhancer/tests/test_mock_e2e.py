"""Offline prompt-to-specification integration coverage for the reviewer path (RFC-0026)."""

import pytest
from config import ProviderConfig
from engine import LLMEngine
from providers import ProviderContextError, ProviderError, ProviderTimeoutError
from workflow import run_enhancement


def _engine(scenario: str = "success") -> LLMEngine:
    return LLMEngine(
        config=ProviderConfig(
            profile="mock",
            base_url="mock://offline",
            model="cowork-deterministic-v1",
            timeout_seconds=1,
            mock_scenario=scenario,
        )
    )


def test_mock_compiles_prompt_end_to_end_without_network(monkeypatch):
    monkeypatch.setenv("COWORK_PROMPT_ENHANCER_SEARCH", "off")
    result = run_enhancement(_engine(), "Build a typed task API", "production-grade", search=False)
    assert result["compiled_prompt"].startswith("Implement Build a typed task API")
    assert "# Known Requirements" in result["compiled_prompt"]
    assert result["debug"]["generation_mode"] == "compiler_technical"
    assert result["gpu"]["profile"] == "mock"


def test_malformed_mock_exercises_field_loop_fallback(monkeypatch):
    monkeypatch.setenv("COWORK_PROMPT_ENHANCER_SEARCH", "off")
    result = run_enhancement(_engine("malformed"), "Write a concise launch memo", "production-grade", search=False)
    assert result["compiled_prompt"]
    assert result["debug"]["generation_mode"] == "single_generic_prompt_template"


@pytest.mark.parametrize(
    ("scenario", "error_type"),
    [
        ("context_overflow", ProviderContextError),
        ("timeout", ProviderTimeoutError),
        ("provider_failure", ProviderError),
    ],
)
def test_terminal_mock_failures_reach_the_caller(monkeypatch, scenario, error_type):
    monkeypatch.setenv("COWORK_PROMPT_ENHANCER_SEARCH", "off")
    with pytest.raises(error_type):
        run_enhancement(_engine(scenario), "Build a typed task API", "production-grade", search=False)
