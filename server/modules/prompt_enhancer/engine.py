"""Provider-neutral inference engine preserving the historical workflow API (RFC-0014, RFC-0026)."""

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

from config import ProviderConfig, load_provider_config
from providers import LlamaServerProvider, MockProvider, OpenAICompatibleProvider, ProviderContextError


def sanitize_text_for_model(text: str) -> str:
    raw = str(text or "")
    return "".join(ch for ch in raw if not 0xD800 <= ord(ch) <= 0xDFFF)


def strip_think_sections(text: str) -> str:
    """Remove inline reasoning tags if a compatible endpoint fails to separate them."""

    cleaned = sanitize_text_for_model(text).strip()
    if not cleaned:
        return cleaned
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.IGNORECASE)
    if re.search(r"<think>", cleaned, flags=re.IGNORECASE):
        cleaned = re.sub(r"<think>[\s\S]*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


@dataclass
class LLMEngine:
    model_id: str = ""
    max_new_tokens: int = 16384
    temperature: float = 0.6
    config: ProviderConfig | None = None

    def __post_init__(self) -> None:
        config = self.config or load_provider_config()
        self.config = config
        if config.profile == "mock":
            self.provider = MockProvider(config.mock_scenario, config.mock_delay_seconds)
        elif config.profile == "local":
            self.provider = LlamaServerProvider(config.base_url, config.timeout_seconds)
        else:
            self.provider = OpenAICompatibleProvider(
                config.base_url, config.model, config.credential, config.timeout_seconds
            )
        self.backend = config.profile
        self.model_source = (self.model_id or config.model) if config.profile == "local" else config.model

        self.top_p = float(os.getenv("COWORK_PROMPT_ENHANCER_TOP_P", "0.95"))
        self.top_k = int(os.getenv("COWORK_PROMPT_ENHANCER_TOP_K", "20"))
        self.min_p = float(os.getenv("COWORK_PROMPT_ENHANCER_MIN_P", "0.0"))
        self.presence_penalty = float(os.getenv("COWORK_PROMPT_ENHANCER_PRESENCE_PENALTY", "0.0"))
        self.repeat_penalty = float(os.getenv("COWORK_PROMPT_ENHANCER_REPEAT_PENALTY", "1.0"))
        self.temperature = float(os.getenv("COWORK_PROMPT_ENHANCER_TEMP", str(self.temperature)))

    def generate(
        self,
        prompt: str,
        max_new_tokens: int | None = None,
        response_format: dict | None = None,
        think: bool = False,
    ) -> str:
        tokens = max_new_tokens or self.max_new_tokens
        messages = [{"role": "user", "content": sanitize_text_for_model(prompt)}]
        effective_tokens = max(1, int(tokens))

        for _ in range(5):
            try:
                result = self.provider.chat(
                    messages,
                    max_tokens=effective_tokens,
                    temperature=self.temperature,
                    top_p=self.top_p,
                    top_k=self.top_k,
                    min_p=self.min_p,
                    presence_penalty=self.presence_penalty,
                    repeat_penalty=self.repeat_penalty,
                    think=think,
                    response_format=response_format,
                )
            except ProviderContextError:
                if effective_tokens > 256:
                    effective_tokens = max(256, effective_tokens // 2)
                    continue
                content = messages[0]["content"]
                if len(content) <= 256:
                    raise
                messages[0]["content"] = content[-max(256, int(len(content) * 0.75)) :]
                effective_tokens = min(effective_tokens, 128)
                continue

            if response_format is not None:
                return result.text
            return strip_think_sections(result.text)

        raise ProviderContextError("generation could not fit within the provider context window")

    @staticmethod
    def extract_json(text: str) -> dict:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z0-9]*\n", "", cleaned)
            cleaned = cleaned.replace("```", "").strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise
            return json.loads(cleaned[start : end + 1])

    def gpu_info(self) -> dict:
        return {
            "backend": self.backend,
            "model_source": self.model_source,
            "healthy": self.provider.health(),
            **self.provider.info(),
        }


def resolve_model_id() -> str:
    default_local = Path(__file__).resolve().parents[2] / "models" / "Qwen3-8B-Q4_K_M.gguf"
    return os.getenv("QWEN_MODEL_ID", os.getenv("COWORK_PROMPT_MODEL", str(default_local)))
