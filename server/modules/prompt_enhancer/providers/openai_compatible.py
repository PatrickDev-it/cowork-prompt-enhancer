"""Vendor-neutral OpenAI-compatible adapter using only the Python standard library (RFC-0026)."""

import json
import urllib.error
import urllib.request
from collections.abc import Sequence

from .base import ChatResult, ProviderContextError, ProviderError, ProviderTimeoutError, redact_secret

_CONTEXT_HINTS = ("context", "exceed", "too large", "too long", "maximum tokens", "n_ctx")


class OpenAICompatibleProvider:
    def __init__(self, base_url: str, model: str, credential: str, request_timeout: float = 600) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._credential = credential
        self.request_timeout = request_timeout

    def _request(self, path: str, *, body: dict | None = None, timeout: float | None = None) -> dict:
        headers = {"Accept": "application/json", "Authorization": f"Bearer {self._credential}"}
        data = None
        method = "GET"
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
            method = "POST"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout or self.request_timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            detail = redact_secret(exc.read().decode("utf-8", "ignore"), self._credential)
            if exc.code in {400, 413, 422} and any(hint in detail.lower() for hint in _CONTEXT_HINTS):
                raise ProviderContextError("provider context window exceeded") from exc
            raise ProviderError(f"provider HTTP {exc.code}: {detail[:300]}") from exc
        except TimeoutError as exc:
            raise ProviderTimeoutError("provider request timed out") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise ProviderTimeoutError("provider request timed out") from exc
            detail = redact_secret(exc.reason, self._credential)
            raise ProviderError(f"provider connection failed: {detail}") from exc
        except (ValueError, json.JSONDecodeError) as exc:
            raise ProviderError("provider returned malformed JSON") from exc

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
        del top_k, min_p, repeat_penalty, think
        body = {
            "model": self.model,
            "messages": list(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "presence_penalty": presence_penalty,
        }
        if response_format is not None:
            body["response_format"] = response_format
        data = self._request("/v1/chat/completions", body=body)
        try:
            choice = data["choices"][0]
            message = choice["message"]
            usage = data.get("usage", {})
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("provider returned a malformed chat response") from exc
        return ChatResult(
            text=message.get("content") or "",
            finish_reason=choice.get("finish_reason") or "",
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            reasoning_content=message.get("reasoning_content"),
        )

    def health(self) -> bool:
        try:
            self._request("/v1/models", timeout=min(5, self.request_timeout))
            return True
        except ProviderError:
            return False

    def info(self) -> dict:
        return {
            "profile": "openai-compatible",
            "base_url": self.base_url,
            "model": self.model,
            "reachable": self.health(),
            "credential_configured": bool(self._credential),
            "capabilities": ["chat", "health", "info"],
        }
