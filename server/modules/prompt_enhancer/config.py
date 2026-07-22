"""Validated named provider profiles (RFC-0026)."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from os import environ
from urllib.parse import urlparse

from providers.base import ProviderConfigurationError

PROFILES = {"mock", "local", "openai-compatible"}
MOCK_SCENARIOS = {"success", "malformed", "context_overflow", "timeout", "provider_failure"}
ALIASES = {"llama_server": "local", "openai_compatible": "openai-compatible", "mock": "mock"}


@dataclass(frozen=True)
class ProviderConfig:
    profile: str
    base_url: str
    model: str
    timeout_seconds: float
    mock_scenario: str = "success"
    credential: str = field(default="", repr=False)

    def public_metadata(self) -> dict:
        return {
            "profile": self.profile,
            "base_url": self.base_url,
            "model": self.model,
            "timeout_seconds": self.timeout_seconds,
            "mock_scenario": self.mock_scenario if self.profile == "mock" else None,
            "credential_configured": bool(self.credential),
        }


def _profile(env: Mapping[str, str]) -> str:
    explicit = env.get("COWORK_PROFILE", "").strip().lower()
    legacy_raw = env.get("COWORK_PROMPT_ENHANCER_PROVIDER", "").strip().lower()
    legacy = ALIASES.get(legacy_raw, legacy_raw) if legacy_raw else ""
    if explicit and legacy and explicit != legacy:
        raise ProviderConfigurationError("COWORK_PROFILE conflicts with COWORK_PROMPT_ENHANCER_PROVIDER")
    profile = explicit or legacy or "mock"
    if profile not in PROFILES:
        raise ProviderConfigurationError(f"unsupported provider profile '{profile}'")
    return profile


def _url(value: str, variable: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ProviderConfigurationError(f"{variable} must be an absolute HTTP(S) URL")
    return value.rstrip("/")


def load_provider_config(env: Mapping[str, str] | None = None) -> ProviderConfig:
    source = environ if env is None else env
    profile = _profile(source)
    try:
        timeout = float(source.get("COWORK_PROVIDER_TIMEOUT_S", source.get("COWORK_LLAMA_REQUEST_TIMEOUT_S", "600")))
    except ValueError as exc:
        raise ProviderConfigurationError("provider timeout must be numeric") from exc
    if timeout <= 0:
        raise ProviderConfigurationError("provider timeout must be greater than zero")

    if profile == "mock":
        scenario = source.get("COWORK_MOCK_SCENARIO", "success").strip().lower()
        if scenario not in MOCK_SCENARIOS:
            raise ProviderConfigurationError(f"unsupported mock scenario '{scenario}'")
        return ProviderConfig(profile, "mock://offline", "cowork-deterministic-v1", timeout, scenario)

    if profile == "local":
        base_url = _url(source.get("COWORK_LLAMA_SERVER_URL", "http://127.0.0.1:8081"), "COWORK_LLAMA_SERVER_URL")
        model = source.get("QWEN_MODEL_ID", source.get("COWORK_PROMPT_MODEL", "local-gguf")).strip()
        return ProviderConfig(profile, base_url, model or "local-gguf", timeout)

    base_url = source.get("COWORK_OPENAI_BASE_URL", "").strip()
    model = source.get("COWORK_OPENAI_MODEL", "").strip()
    credential = source.get("COWORK_OPENAI_API_KEY", "").strip()
    missing = [
        name
        for name, value in (
            ("COWORK_OPENAI_BASE_URL", base_url),
            ("COWORK_OPENAI_MODEL", model),
            ("COWORK_OPENAI_API_KEY", credential),
        )
        if not value
    ]
    if missing:
        raise ProviderConfigurationError(f"openai-compatible profile requires {', '.join(missing)}")
    return ProviderConfig(profile, _url(base_url, "COWORK_OPENAI_BASE_URL"), model, timeout, credential=credential)
