"""Astrazione provider LLM — RFC-0014. L'applicazione conosce solo un'interfaccia "Chat
Completions" (OpenAI-compatible), non il backend concreto. Oggi: LlamaServerProvider (llama-server
via HTTP OpenAI). Domani: OpenAI/vLLM/SGLang con la stessa interfaccia, senza toccare la logica."""

from .base import ChatResult, LLMProvider, ProviderContextError, ProviderError
from .llama_server import LlamaServerProvider

__all__ = ["ChatResult", "LLMProvider", "ProviderError", "ProviderContextError", "LlamaServerProvider"]
