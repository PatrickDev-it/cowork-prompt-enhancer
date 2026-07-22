"""Deterministic offline provider for CI, demos, and failure injection (RFC-0026)."""

import json
import time
from collections.abc import Sequence

from .base import ChatResult, ProviderContextError, ProviderError, ProviderTimeoutError


class MockProvider:
    def __init__(self, scenario: str = "success", delay_seconds: float = 0.0) -> None:
        self.scenario = scenario
        self.delay_seconds = delay_seconds

    @staticmethod
    def _request(prompt: str) -> str:
        request = prompt.rpartition("REQUEST:\n")[2] or prompt
        request = request.split("\nCompile the REQUEST", 1)[0].strip()
        return " ".join(request.split())[:240] or "Complete the requested task"

    @staticmethod
    def _compiler_response(request: str) -> str:
        return json.dumps(
            {
                "directive": f"Implement {request.rstrip('.')} and deliver a verified result.",
                "task": request,
                "context": "Deterministic offline demonstration; no external facts were retrieved.",
                "known_requirements": [request],
                "inferred_requirements": ["Handle failures explicitly.", "Keep the implementation testable."],
                "implementation_strategy": ["Preserve the stated scope.", "Implement and validate incrementally."],
                "constraints": ["Do not invent vendor or library choices."],
                "quality_expectations": ["Use clear interfaces and deterministic tests."],
                "validation_checklist": ["Verify every explicit requirement.", "Run the documented checks."],
                "output_requirements": ["Return the implementation and concise validation evidence."],
            },
            ensure_ascii=True,
        )

    def chat(
        self,
        messages: Sequence[dict],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        top_k: int,
        min_p: float,
        presence_penalty: float,
        repeat_penalty: float,
        think: bool = False,
        response_format: dict | None = None,
    ) -> ChatResult:
        del max_tokens, temperature, top_p, top_k, min_p, presence_penalty, repeat_penalty, think, response_format
        if self.delay_seconds:
            time.sleep(self.delay_seconds)
        if self.scenario == "context_overflow":
            raise ProviderContextError("mock context window exceeded")
        if self.scenario == "timeout":
            raise ProviderTimeoutError("mock provider deadline exceeded")
        if self.scenario == "provider_failure":
            raise ProviderError("mock provider failure")
        prompt = str(messages[-1].get("content", "")) if messages else ""
        if self.scenario == "malformed":
            text = "malformed mock output without a JSON envelope"
        else:
            text = self._compiler_response(self._request(prompt))
        return ChatResult(text, "stop", max(1, len(prompt) // 4), max(1, len(text) // 4))

    def health(self) -> bool:
        return self.scenario not in {"timeout", "provider_failure"}

    def info(self) -> dict:
        return {
            "profile": "mock",
            "model": "cowork-deterministic-v1",
            "scenario": self.scenario,
            "reachable": self.health(),
            "capabilities": ["chat", "health", "info", "failure-injection"],
        }
