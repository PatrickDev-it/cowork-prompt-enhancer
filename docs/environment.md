# Environment-variable reference

Configuration is selected through `COWORK_PROFILE`: `mock` (default), `local`, or `openai-compatible`.
Invalid combinations fail before workers start. Secret values must never be placed in committed files.

| Variable | Default | Purpose |
|---|---|---|
| `COWORK_PROFILE` | `mock` | Validated provider profile. |
| `COWORK_MOCK_SCENARIO` | `success` | Deterministic success or failure-injection scenario. |
| `COWORK_MOCK_DELAY_MS` | `0` | Bounded deterministic delay for cancellation/failure tests. |
| `COWORK_PROVIDER_TIMEOUT_S` | `600` | Provider request deadline. |
| `COWORK_OPENAI_BASE_URL` | none | Vendor-neutral compatible endpoint. |
| `COWORK_OPENAI_MODEL` | none | Remote model identity. |
| `COWORK_OPENAI_API_KEY` | none | Required remote credential; always redacted. |

`COWORK_PROMPT_ENHANCER_PROVIDER` is a one-release compatibility alias. `llama_server` maps to `local`
and `openai_compatible` maps to `openai-compatible`; conflicts are rejected.

## Client and server

| Variable | Default | Purpose |
|---|---|---|
| `COWORK_SERVER_IP` | `127.0.0.1` | Client WebSocket host. |
| `COWORK_SERVER_PORT` | `8080` | Client WebSocket port. |
| `COWORK_PORT` | `8080` | Server listen port. |
| `COWORK_HOST` | `127.0.0.1` | Explicit server bind host. |
| `COWORK_ALLOW_REMOTE` | `false` | Required explicit opt-in for non-loopback binding. |
| `COWORK_AUTH_SECRET` | none | Minimum 32-character remote session secret; never logged. |
| `COWORK_CLIENT_ID` | generated per client process | Stable ID used for reconnect deduplication. |
| `COWORK_MAX_FRAME_BYTES` | `1048576` | Maximum WebSocket application frame. |
| `COWORK_MAX_PAYLOAD_BYTES` | `524288` | Maximum decoded command/event payload. |
| `COWORK_MAX_ACTIVE_COMMANDS` | `4` | Global active-command bound. |
| `COWORK_MAX_SESSION_COMMANDS` | `2` | Per-connection active-command bound. |
| `COWORK_MAX_QUEUED_COMMANDS` | `32` | Global queued-command bound. |
| `COWORK_COMMAND_TIMEOUT_MS` | `600000` | End-to-end command deadline. |
| `COWORK_METRICS` | `false` | Expose bounded, credential-free request traces at loopback-only `/metrics`. |
| `COWORK_ROOT` | current working directory | Session capability root. |
| `COWORK_INPUT_DIR` | profile-specific | Optional project input root. |
| `COWORK_PYTHON` | `server/modules/.venv/.../python` | Python worker executable. |
| `COWORK_PROMPT_ENHANCER_DIR` | bundled module | Python compiler module directory. |

## Local inference

| Variable | Default | Purpose |
|---|---|---|
| `COWORK_PROMPT_MODEL` | `server/models/Qwen3-8B-Q4_K_M.gguf` | Model path. |
| `COWORK_LLAMA_SERVER_BIN` | `server/bin/llama-server.exe` | Inference-server executable. |
| `COWORK_LLAMA_SERVER_HOST` | `127.0.0.1` | llama-server host. |
| `COWORK_LLAMA_SERVER_PORT` | `8081` | llama-server port. |
| `COWORK_LLAMA_SERVER_URL` | `http://127.0.0.1:8081` | Python provider URL. |
| `COWORK_LLAMA_HEALTH_TIMEOUT_MS` | implementation default | Supervisor health deadline. |
| `COWORK_LLAMA_RESTART_BACKOFF_MS` | implementation default | Initial restart delay. |
| `COWORK_LLAMA_RESTART_MAX` | implementation default | Restart cap. |
| `COWORK_LLAMA_REQUEST_TIMEOUT_S` | `600` | Provider request timeout. |

`LLAMA_N_CTX`, `LLAMA_N_GPU_LAYERS`, `LLAMA_N_BATCH`, `LLAMA_N_UBATCH`, `LLAMA_N_THREADS`,
`LLAMA_KV_TYPE`, `LLAMA_FLASH_ATTN`, `LLAMA_PARALLEL`, `LLAMA_CACHE_REUSE`, and `LLAMA_REASONING`
override llama.cpp flags. Their defaults are measured and documented in `server/config.ts`.

## Compiler and scan controls

`COWORK_PROMPT_ENHANCER_STRATEGY`, `COWORK_PROMPT_ENHANCER_SEARCH`, token-budget and sampler variables
control compiler behavior. `COWORK_COMPRESS_*` controls semantic compression. `COWORK_SCAN_*` limits
project scanning by depth, extension and byte budgets. See the validated preflight output before running
a non-default profile.
