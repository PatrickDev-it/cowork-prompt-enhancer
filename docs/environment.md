# Environment-variable reference

Configuration is selected through a named profile. Values below describe the current local profile;
provider and protocol variables are expanded in their implementation phases. Secret values must never be
placed in committed files.

## Client and server

| Variable | Default | Purpose |
|---|---|---|
| `COWORK_SERVER_IP` | `127.0.0.1` | Client WebSocket host. |
| `COWORK_SERVER_PORT` | `8080` | Client WebSocket port. |
| `COWORK_PORT` | `8080` | Server listen port. |
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
