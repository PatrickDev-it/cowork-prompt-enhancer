"""Backend-independent provider contract and stable public error categories (RFC-0026)."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class ProviderError(RuntimeError):
    """A provider rejected or failed a request."""

    code = "provider_error"


class ProviderConfigurationError(ProviderError):
    """Provider configuration is invalid and no worker should start."""

    code = "provider_configuration"


class ProviderContextError(ProviderError):
    """The prompt and requested output exceed the provider context window."""

    code = "provider_context_overflow"


class ProviderTimeoutError(ProviderError):
    """The provider did not complete within the configured deadline."""

    code = "provider_timeout"


@dataclass(frozen=True)
class ChatResult:
    """Normalized provider response."""

    text: str
    finish_reason: str
    prompt_tokens: int
    completion_tokens: int
    reasoning_content: str | None = None

    @property
    def truncated(self) -> bool:
        return self.finish_reason == "length"


class LLMProvider(Protocol):
    """Minimal provider seam shared by local, mock, and OpenAI-compatible adapters."""

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


def redact_secret(value: object, secret: str | None) -> str:
    """Return diagnostic text with an in-memory credential removed."""

    text = str(value)
    return text.replace(secret, "[REDACTED]") if secret else text
