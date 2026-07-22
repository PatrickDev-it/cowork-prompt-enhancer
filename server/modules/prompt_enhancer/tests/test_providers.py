"""Provider conformance, failure categories, configuration, and redaction tests (RFC-0026)."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from config import load_provider_config
from providers import (
    LlamaServerProvider,
    MockProvider,
    OpenAICompatibleProvider,
    ProviderConfigurationError,
    ProviderContextError,
    ProviderError,
    ProviderTimeoutError,
)

CHAT_ARGS = {
    "messages": [{"role": "user", "content": "Build a typed API"}],
    "max_tokens": 256,
    "temperature": 0.2,
    "top_p": 0.9,
    "top_k": 20,
    "min_p": 0.0,
    "presence_penalty": 0.0,
    "repeat_penalty": 1.0,
}


class CompatibleHandler(BaseHTTPRequestHandler):
    requests: list[dict] = []
    mode = "success"

    def log_message(self, format, *args):
        del format, args

    def _json(self, status: int, value: dict):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.requests.append({"method": "GET", "path": self.path, "authorization": self.headers.get("Authorization")})
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        elif self.path == "/props":
            self._json(
                200, {"model_path": "fixture.gguf", "total_slots": 2, "default_generation_settings": {"n_ctx": 4096}}
            )
        elif self.path == "/v1/models":
            self._json(200, {"data": [{"id": "fixture-model"}]})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(size))
        self.requests.append(
            {"method": "POST", "path": self.path, "authorization": self.headers.get("Authorization"), "body": body}
        )
        if self.mode == "context":
            self._json(400, {"error": "context window exceeded"})
            return
        if self.mode == "credential":
            self._json(500, {"error": self.headers.get("Authorization")})
            return
        if self.mode == "malformed":
            self._json(200, {"unexpected": True})
            return
        self._json(
            200,
            {
                "choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}'}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 4},
            },
        )


@pytest.fixture
def compatible_server():
    CompatibleHandler.requests = []
    CompatibleHandler.mode = "success"
    server = ThreadingHTTPServer(("127.0.0.1", 0), CompatibleHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def _assert_conformance(provider):
    assert provider.health() is True
    result = provider.chat(**CHAT_ARGS)
    assert result.text
    assert result.finish_reason == "stop"
    assert result.prompt_tokens >= 0
    assert result.completion_tokens >= 0
    info = provider.info()
    assert isinstance(info, dict)
    assert info.get("profile") in {"mock", "local", "openai-compatible"}


def test_mock_provider_conforms():
    _assert_conformance(MockProvider())


def test_local_provider_conforms_with_http_double(compatible_server):
    _assert_conformance(LlamaServerProvider(compatible_server, request_timeout=2))


def test_openai_provider_conforms_with_http_double(compatible_server):
    _assert_conformance(OpenAICompatibleProvider(compatible_server, "fixture-model", "test-secret", 2))


@pytest.mark.parametrize(
    ("scenario", "error_type"),
    [
        ("context_overflow", ProviderContextError),
        ("timeout", ProviderTimeoutError),
        ("provider_failure", ProviderError),
    ],
)
def test_mock_failure_scenarios_are_typed(scenario, error_type):
    with pytest.raises(error_type):
        MockProvider(scenario).chat(**CHAT_ARGS)


def test_mock_malformed_scenario_is_deterministic():
    first = MockProvider("malformed").chat(**CHAT_ARGS).text
    second = MockProvider("malformed").chat(**CHAT_ARGS).text
    assert first == second == "malformed mock output without a JSON envelope"


def test_local_context_error_is_typed(compatible_server):
    CompatibleHandler.mode = "context"
    with pytest.raises(ProviderContextError):
        LlamaServerProvider(compatible_server, 2).chat(**CHAT_ARGS)


def test_openai_context_error_is_typed(compatible_server):
    CompatibleHandler.mode = "context"
    with pytest.raises(ProviderContextError):
        OpenAICompatibleProvider(compatible_server, "model", "secret", 2).chat(**CHAT_ARGS)


def test_malformed_remote_response_is_typed(compatible_server):
    CompatibleHandler.mode = "malformed"
    with pytest.raises(ProviderError, match="malformed chat response"):
        OpenAICompatibleProvider(compatible_server, "model", "secret", 2).chat(**CHAT_ARGS)


def test_openai_adapter_sends_standard_fields_and_bearer_credential(compatible_server):
    provider = OpenAICompatibleProvider(compatible_server, "chosen-model", "credential-value", 2)
    provider.chat(**CHAT_ARGS)
    request = CompatibleHandler.requests[-1]
    assert request["authorization"] == "Bearer credential-value"
    assert request["body"]["model"] == "chosen-model"
    assert "top_k" not in request["body"]
    assert "min_p" not in request["body"]


def test_openai_info_never_contains_credential(compatible_server):
    info = OpenAICompatibleProvider(compatible_server, "model", "credential-value", 2).info()
    assert "credential-value" not in json.dumps(info)
    assert info["credential_configured"] is True


def test_openai_error_redacts_credential_even_if_provider_echoes_it(compatible_server):
    CompatibleHandler.mode = "credential"
    provider = OpenAICompatibleProvider(compatible_server, "model", "credential-value", 2)
    with pytest.raises(ProviderError) as captured:
        provider.chat(**CHAT_ARGS)
    assert "credential-value" not in str(captured.value)
    assert "[REDACTED]" in str(captured.value)


@pytest.mark.parametrize("provider_kind", ["local", "openai-compatible"])
def test_http_adapter_timeout_is_typed(monkeypatch, provider_kind):
    def timeout(*args, **kwargs):
        del args, kwargs
        raise TimeoutError

    monkeypatch.setattr("urllib.request.urlopen", timeout)
    provider = (
        LlamaServerProvider("http://127.0.0.1:1", 0.01)
        if provider_kind == "local"
        else OpenAICompatibleProvider("http://127.0.0.1:1", "model", "credential", 0.01)
    )
    with pytest.raises(ProviderTimeoutError):
        provider.chat(**CHAT_ARGS)


def test_config_defaults_to_offline_mock():
    config = load_provider_config({})
    assert config.profile == "mock"
    assert config.model == "cowork-deterministic-v1"


def test_config_accepts_legacy_local_alias():
    config = load_provider_config({"COWORK_PROMPT_ENHANCER_PROVIDER": "llama_server"})
    assert config.profile == "local"


def test_config_rejects_conflicting_alias():
    with pytest.raises(ProviderConfigurationError, match="conflicts"):
        load_provider_config({"COWORK_PROFILE": "mock", "COWORK_PROMPT_ENHANCER_PROVIDER": "llama_server"})


def test_config_rejects_unknown_profile():
    with pytest.raises(ProviderConfigurationError, match="unsupported"):
        load_provider_config({"COWORK_PROFILE": "vendor-specific"})


def test_config_rejects_unknown_mock_scenario():
    with pytest.raises(ProviderConfigurationError, match="scenario"):
        load_provider_config({"COWORK_PROFILE": "mock", "COWORK_MOCK_SCENARIO": "random"})


def test_openai_profile_requires_all_values_without_echoing_secret():
    with pytest.raises(ProviderConfigurationError) as captured:
        load_provider_config({"COWORK_PROFILE": "openai-compatible", "COWORK_OPENAI_API_KEY": "sensitive"})
    assert "sensitive" not in str(captured.value)


def test_openai_config_repr_redacts_credential():
    config = load_provider_config(
        {
            "COWORK_PROFILE": "openai-compatible",
            "COWORK_OPENAI_BASE_URL": "https://example.test",
            "COWORK_OPENAI_MODEL": "model",
            "COWORK_OPENAI_API_KEY": "sensitive",
        }
    )
    assert "sensitive" not in repr(config)
    assert "sensitive" not in json.dumps(config.public_metadata())
