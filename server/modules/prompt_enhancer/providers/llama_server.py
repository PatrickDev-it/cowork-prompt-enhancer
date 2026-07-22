"""Local llama-server adapter with typed transport failures (RFC-0014, RFC-0026)."""

import json
import os
import urllib.error
import urllib.request
from collections.abc import Sequence

from correlation import get_correlation_id

from .base import ChatResult, ProviderContextError, ProviderError, ProviderTimeoutError

_CONTEXT_HINTS = ("context", "exceed", "too large", "too long", "n_ctx", "kv cache")


class LlamaServerProvider:
    def __init__(self, base_url: str, request_timeout: float | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.request_timeout = (
            request_timeout
            if request_timeout is not None
            else float(os.getenv("COWORK_LLAMA_REQUEST_TIMEOUT_S", "600"))
        )

    def _post(self, path: str, body: dict, timeout: float) -> dict:
        data = json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        correlation_id = get_correlation_id()
        if correlation_id:
            headers["X-Correlation-ID"] = correlation_id
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")
            if exc.code == 400 and any(hint in detail.lower() for hint in _CONTEXT_HINTS):
                raise ProviderContextError("llama-server context window exceeded") from exc
            raise ProviderError(f"llama-server HTTP {exc.code}: {detail[:300]}") from exc
        except TimeoutError as exc:
            raise ProviderTimeoutError("llama-server request timed out") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise ProviderTimeoutError("llama-server request timed out") from exc
            raise ProviderError(f"llama-server connection failed: {exc.reason}") from exc
        except (ValueError, json.JSONDecodeError) as exc:
            raise ProviderError("llama-server returned malformed JSON") from exc

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
        body = {
            "messages": list(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "min_p": min_p,
            "presence_penalty": presence_penalty,
            "repeat_penalty": repeat_penalty,
            "chat_template_kwargs": {"enable_thinking": bool(think)},
        }
        if response_format is not None:
            body["response_format"] = response_format

        data = self._post("/v1/chat/completions", body, self.request_timeout)
        try:
            choice = data["choices"][0]
            message = choice["message"]
            usage = data.get("usage", {})
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("llama-server returned a malformed chat response") from exc

        return ChatResult(
            text=message.get("content") or "",
            finish_reason=choice.get("finish_reason") or "",
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            reasoning_content=message.get("reasoning_content"),
        )

    def health(self) -> bool:
        try:
            with urllib.request.urlopen(self.base_url + "/health", timeout=5) as response:
                return json.load(response).get("status") == "ok"
        except Exception:
            return False

    def info(self) -> dict:
        try:
            with urllib.request.urlopen(self.base_url + "/props", timeout=5) as response:
                props = json.load(response)
        except Exception as exc:
            return {"profile": "local", "server_url": self.base_url, "reachable": False, "error": str(exc)}
        generation = props.get("default_generation_settings", {}) or {}
        return {
            "profile": "local",
            "server_url": self.base_url,
            "reachable": True,
            "model_path": props.get("model_path"),
            "n_ctx_per_slot": generation.get("n_ctx"),
            "total_slots": props.get("total_slots"),
            "build_info": props.get("build_info"),
            "capabilities": ["chat", "health", "info", "reasoning", "json-response-format"],
        }
