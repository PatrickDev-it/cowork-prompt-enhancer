"""Provider llama-server via API OpenAI-compatible — RFC-0014. Client HTTP con sola stdlib
(urllib): nessuna dipendenza nuova. L'inferenza passa ESCLUSIVAMENTE per /v1/chat/completions.

Reasoning per-richiesta nativo (verificato sul build b9893): `chat_template_kwargs.enable_thinking`
attiva/spegne il thinking a livello di singola richiesta, e il ragionamento finisce in
`message.reasoning_content` separato — `content` resta sempre pulito (niente strip lato client)."""

import json
import os
import urllib.error
import urllib.request
from collections.abc import Sequence

from .base import ChatResult, ProviderContextError, ProviderError

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
        req = urllib.request.Request(
            self.base_url + path, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", "ignore")
            except Exception:
                pass
            low = detail.lower()
            if exc.code == 400 and any(h in low for h in _CONTEXT_HINTS):
                raise ProviderContextError(detail or "context exceeded") from exc
            raise ProviderError(f"llama-server HTTP {exc.code}: {detail[:300]}") from exc
        except urllib.error.URLError as exc:
            raise ProviderError(f"llama-server irraggiungibile: {exc.reason}") from exc

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
            # Reasoning nativo per-richiesta (niente prefill hack): OFF di default, ON su richiesta.
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
            raise ProviderError(f"risposta llama-server malformata: {str(data)[:300]}") from exc

        return ChatResult(
            text=message.get("content") or "",
            finish_reason=choice.get("finish_reason") or "",
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            reasoning_content=message.get("reasoning_content"),
        )

    def health(self) -> bool:
        try:
            with urllib.request.urlopen(self.base_url + "/health", timeout=5) as resp:
                return json.load(resp).get("status") == "ok"
        except Exception:
            return False

    def info(self) -> dict:
        try:
            with urllib.request.urlopen(self.base_url + "/props", timeout=5) as resp:
                props = json.load(resp)
        except Exception as exc:
            return {"server_url": self.base_url, "reachable": False, "error": str(exc)}
        gen = props.get("default_generation_settings", {}) or {}
        return {
            "server_url": self.base_url,
            "reachable": True,
            "model_path": props.get("model_path"),
            "n_ctx_per_slot": gen.get("n_ctx"),
            "total_slots": props.get("total_slots"),
            "build_info": props.get("build_info"),
        }
