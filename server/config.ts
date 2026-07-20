import { join } from 'node:path';

export const PORT = Number(process.env.COWORK_PORT ?? 8080);

/**
 * Python interpreter for tools that spawn Python processes — RFC-0005 § 3, RFC-0006.
 * Default: the modules' shared venv (self-contained, with the llama-cpp GPU wheel).
 * Override via COWORK_PYTHON to use a different interpreter.
 */
const VENV_PYTHON =
  process.platform === 'win32'
    ? join(import.meta.dir, 'modules', '.venv', 'Scripts', 'python.exe')
    : join(import.meta.dir, 'modules', '.venv', 'bin', 'python');
export const PYTHON_BIN = process.env.COWORK_PYTHON ?? VENV_PYTHON;

/** Folder of the vendored prompt-enhancer engine (self-contained inside the workspace). */
export const PROMPT_ENHANCER_DIR =
  process.env.COWORK_PROMPT_ENHANCER_DIR ?? join(import.meta.dir, 'modules', 'prompt_enhancer');

/**
 * Vendored .gguf model inside the workspace (self-contained). Override via COWORK_PROMPT_MODEL.
 * **Qwen3-8B dense (standard attention)** — conforms to RFC-0023 (no SSM hybrids). Replaces the
 * previous hybrid `Qwen3.5-9B`: benchmark 2026-07-08 (RTX 3070 Ti) → decode 86 vs 68 tok/s, prefill
 * ~1500 vs ~100 tok/s (~15×), 3-stream concurrency ~181 vs ~24 tok/s aggregate (~7.5×), VRAM 5.9 vs 7.9 GB,
 * `cache-reuse` finally active. The `Qwen3-0.6B` draft model sits in `models/` for speculative decoding,
 * but this llama-server build doesn't hook it up (draft never loaded) → no need to pass it; the
 * standard model is already a clean win on its own.
 */
export const PROMPT_MODEL_PATH =
  process.env.COWORK_PROMPT_MODEL ?? join(import.meta.dir, 'models', 'Qwen3-8B-Q4_K_M.gguf');

/**
 * External `llama-server` inference backend — RFC-0014. The model is NO LONGER embedded in the
 * Python process (no more llama-cpp-python): it lives in a supervised `llama-server`, spoken to via
 * an OpenAI-compatible API. Binary + DLLs vendored in `server/bin/` (git-ignored, like the .gguf).
 */
export const LLAMA_SERVER_BIN = process.env.COWORK_LLAMA_SERVER_BIN ?? join(import.meta.dir, 'bin', 'llama-server.exe');
export const LLAMA_SERVER_HOST = process.env.COWORK_LLAMA_SERVER_HOST ?? '127.0.0.1';
export const LLAMA_SERVER_PORT = Number(process.env.COWORK_LLAMA_SERVER_PORT ?? 8081);
export const LLAMA_SERVER_URL = `http://${LLAMA_SERVER_HOST}:${LLAMA_SERVER_PORT}`;

/**
 * Every model flag passes through llama-server's official flags (RFC-0014, requirements 5+8):
 * each one is overridable via env. `--parallel 2` enables continuous batching / concurrent
 * requests; `--reasoning off` is the native default (the per-request toggle travels in the OpenAI
 * body). VRAM note: `--ctx-size` is the total, split across the `--parallel` slots (2 slots →
 * ctx/2 per request).
 */
export function llamaServerArgs(): string[] {
  const e = process.env;
  // KV cache **q4_0** (RFC-0014 amendment 2026-07-07): halves the KV's variable cost → unlocks a
  // much larger context at the same VRAM, with no measurable quality regression on our task.
  const kv = e.LLAMA_KV_TYPE ?? 'q4_0';
  // Defaults for **Qwen3-8B dense** (RFC-0023) — **production config for 3-4 concurrent users**
  // (RFC-0024, benchmarked 2026-07-08 on an RTX 3070 Ti 8GB, llama.cpp build b9917):
  // - `--parallel 4`: continuous batching across 4 slots. **The key choice**: a single user still gets
  //   ~84 tok/s (idle slots don't slow down a lone request), 4 concurrent users get ~47 tok/s each, FAIR
  //   (0.96-1.00), TTFT ~0.5s, no queueing up to 4. Dominates `--parallel 3` (same speed at ≤3 active, but
  //   handles the 4th with no queue). Beyond 5 isn't worth it (target is 3-4 users).
  // - `--ctx-size 40960` = 4 slots × **10240 tokens/slot** (RFC-0024 amendment 2026-07-08). The safe CTX
  //   ceiling at parallel 4 on 8 GB: measured VRAM curve (Q4, KV q4_0) 32768→6.6 GB / **40960→7.2 GB
  //   (~1 GB headroom)** / 49152→7.6 GB / 65536→7.8 GB (tight). KV grows ~490 MiB every +8192 tokens.
  //   40960 keeps a healthy margin for decode buffers + desktop use, and stays ≤ 40960 (the model's own
  //   coherence limit, its "total context"). For much longer input (large codebases) the lever is
  //   lowering `--parallel` (bigger slots): parallel 2 → 20480/slot ~72 KB; parallel 1 → 40960/slot (the
  //   model's max) ~150 KB. Q5 (5.85 GB, −0.8 GB headroom, −23% decode) doesn't pay off: Q4 leaves more
  //   room for CTX and is faster (benchmarked 2026-07-08).
  // - `--batch-size 2048 --ubatch-size 512`: fast prefill (~3000+ tok/s → TTFT ~0.5s on a ~1.5k prompt).
  // - `--cache-reuse 256`: **prefix caching ACTIVE** on the dense 8B (the hybrid model disabled it) —
  //   reuses the shared-prefix KV across requests (high value for the prompt-enhancer's fixed compiler prompt).
  // - `--gpu-layers 999`: weights 100% on GPU (~5 GB Q4); headroom remains (total VRAM ~5.9 GB vs 7.9 for the 9B).
  // - **Prefill ~1500 tok/s** (standard attention, no longer bottlenecked like the old SSM's ~120),
  //   and **`--cache-reuse` now actually EFFECTIVE** (the standard model supports it; the hybrid disabled it).
  // - **Speculative decoding is deliberately NOT enabled.** Investigated thoroughly (build 9893, RFC-0023):
  //   it's enabled via `--spec-type draft-simple` (the default is `none` → passing only `-md` was silently
  //   ignored), and once enabled it does work (acceptance stats show up in the timings). BUT it's a **net
  //   regression** on this build/GPU in every configuration measured: draft-simple 6.4-44 tok/s, ngram 72-83,
  //   vs a **baseline of 86**. Cause: the baseline is already fast (small 8B model, near the bandwidth
  //   ceiling) and reuses CUDA graphs; speculative decoding varies the batch size every round → graph
  //   recompilation + draft-model forward pass → overhead that outweighs the acceptance gain. The draft
  //   model stays in `models/`. Everything here is overridable via env.
  return [
    '--model',
    PROMPT_MODEL_PATH,
    '--host',
    LLAMA_SERVER_HOST,
    '--port',
    String(LLAMA_SERVER_PORT),
    '--ctx-size',
    e.LLAMA_N_CTX ?? '40960',
    '--gpu-layers',
    e.LLAMA_N_GPU_LAYERS ?? '999',
    '--batch-size',
    e.LLAMA_N_BATCH ?? '2048',
    '--ubatch-size',
    e.LLAMA_N_UBATCH ?? '512',
    '--threads',
    e.LLAMA_N_THREADS ?? '8',
    '--cache-type-k',
    kv,
    '--cache-type-v',
    kv,
    '--flash-attn',
    e.LLAMA_FLASH_ATTN ?? 'on',
    '--parallel',
    e.LLAMA_PARALLEL ?? '4',
    '--cache-reuse',
    e.LLAMA_CACHE_REUSE ?? '256',
    '--reasoning',
    e.LLAMA_REASONING ?? 'off',
  ];
}
