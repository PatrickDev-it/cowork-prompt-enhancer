"""LLM provider interface — RFC-0014. The minimal "Chat Completions" contract the engine talks to,
independent of the backend. Stdlib only."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class ProviderError(RuntimeError):
    """Generic provider error (network, backend not ready, malformed response)."""


class ProviderContextError(ProviderError):
    """The prompt (+ requested output) exceeds the backend's context window. The engine reacts by
    reducing the token budget / shortening the prompt and retrying — same intent as the historical
    retry."""


@dataclass
class ChatResult:
    """Backend-independent, normalized result of a chat completion."""

    text: str
    finish_reason: str
    prompt_tokens: int
    completion_tokens: int
    reasoning_content: str | None = None

    @property
    def truncated(self) -> bool:
        return self.finish_reason == "length"


class LLMProvider(Protocol):
    """An LLM backend spoken through a single abstraction. Any implementation (llama-server,
    OpenAI, vLLM, SGLang) exposes these three methods."""

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
    ) -> ChatResult: ...

    def health(self) -> bool: ...

    def info(self) -> dict: ...
