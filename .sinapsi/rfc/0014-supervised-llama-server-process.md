# RFC 0014 — External Supervised `llama-server` Replaces In-Process Inference

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/modules/llm/supervisor.ts`, `server/modules/prompt_enhancer/engine.py`,
> `server/modules/prompt_enhancer/providers/base.py`, `server/modules/prompt_enhancer/providers/llama_server.py`,
> `server/modules/requirements.txt` (historical note).
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).

## Context

`server/modules/requirements.txt` records the prior state directly: through RFC-0013, the Python
prompt-enhancer worker depended on `llama-cpp-python==0.3.30-cu125` — a CUDA wheel loaded
in-process, meaning the Python worker itself owned the model weights, the GPU context, and every
CUDA/driver/PATH concern needed to make that wheel find its native libraries. `engine.py`'s current
module docstring names the API surface that had to survive the change unmodified:
`LLMEngine.generate`/`extract_json`/`gpu_info` — the exact three methods `workflow.py` calls,
regardless of what sits behind them.

An in-process model has two costs that compound as the system grows past a single consumer. First,
the model can only be shared within that one Python process — a second module wanting inference
(the context compressor that RFC-0015 introduces) would need its own loaded copy, doubling VRAM
for no benefit. Second, a crash inside inference (a bad CUDA kernel launch, an OOM) takes the whole
worker process down with it, losing every in-flight request, not just the one that triggered it.

## Proposal

- **Move the model out of Python entirely, into a supervised `llama-server` process.**
  `server/modules/llm/supervisor.ts` owns that process's full lifecycle: `startLlm()` spawns it
  fire-and-forget (so `Bun.serve` starts accepting connections immediately rather than blocking on
  model load); `ensureLlmReady()` polls `/health` with a configurable timeout before the first real
  request is allowed through; a crash triggers an exponential-backoff restart
  (`BACKOFF_MS * restarts`, capped at `MAX_RESTARTS`) instead of taking the server down; `stopLlm()`
  is wired to `exit`/`SIGINT`/`SIGTERM` so the child process never outlives its parent.
- **Talk to it over the OpenAI-compatible Chat Completions API, never in-process.**
  `providers/base.py` defines `LLMProvider` as a `Protocol` (`chat`/`health`/`info`) explicitly
  documented as backend-agnostic ("llama-server, OpenAI, vLLM, SGLang"); `providers/llama_server.py`
  is the one concrete implementation today, a stdlib-only HTTP client (`urllib`) with no CUDA
  dependency of any kind.
- **Keep `LLMEngine`'s public API frozen across the change.** `engine.py`'s `LLMEngine` still
  exposes `generate`/`extract_json`/`gpu_info` with the same signatures `workflow.py` already
  called — `model_id` becomes diagnostic-only (`"(configured on the llama-server side)"` when
  unset), and `ProviderContextError` handling preserves the historical retry behavior (shrink the
  output budget first, then truncate the prompt keeping the tail) even though the underlying
  transport is now HTTP instead of an in-process call.
- **The model is shared, not per-module.** Because the process lives outside Python and is spoken
  to over HTTP, any module — `prompt_enhancer` today, `context_compressor` (RFC-0015) tomorrow —
  reaches the same warm model through the same supervisor, at zero marginal VRAM cost per
  additional consumer.

## Alternatives

*(Reconstructed: no rejected alternative is recorded verbatim in the source. The following are the
plausible alternatives this design's shape rules out.)*

- **Keep `llama-cpp-python` in-process, share it via a second Python worker or IPC.** Would still
  require every consumer to be a Python process (or talk IPC to one), and does nothing to isolate a
  CUDA-level crash from the request-handling logic around it.
- **A Python-level supervisor (e.g. multiprocessing, a subprocess pool) instead of a TypeScript
  one.** Rejected by locality: the Bun server already owns process lifecycle for the whole
  application (it starts before any Python code runs) and already needs to know whether the model
  is healthy before routing work to it — putting the supervisor in the same runtime that decides
  when to route requests avoids a second cross-process health-check hop.

## Decision

Adopt an external, TypeScript-supervised `llama-server` process spoken to exclusively over an
OpenAI-compatible HTTP API, behind an `LLMProvider` `Protocol` that keeps the concrete backend
swappable, with `LLMEngine`'s call-site API held constant across the change.

## Consequences

**Positive:** a GPU-level crash restarts the inference process without touching the Bun server or
any Python worker; the model is shared across every current and future consumer of `@/modules/llm`
at no extra VRAM cost (this is what makes RFC-0015's context compressor cheap to add); the Python
side of the prompt-enhancer is stdlib-only and has zero CUDA/driver packaging concerns, because
`providers/llama_server.py` only ever speaks HTTP.

**Costs / trade-offs:** every inference call now costs one HTTP round-trip instead of an in-process
function call — acceptable here because the calls are already multi-second LLM generations, where
that overhead is immaterial. The `LLMProvider` Protocol is explicitly designed to accept other
backends (OpenAI, vLLM, SGLang) but only `llama_server.py` exists today; RFC-0025 Phase 3 proposes
the first additional implementation (`openai_compatible.py`).
