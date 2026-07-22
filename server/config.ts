import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_MAX_FRAME_BYTES, DEFAULT_MAX_PAYLOAD_BYTES } from '../protocol';

export type ProviderProfile = 'mock' | 'local' | 'openai-compatible';

const PROFILE_ALIASES: Record<string, ProviderProfile> = {
  mock: 'mock',
  llama_server: 'local',
  openai_compatible: 'openai-compatible',
};

export function resolveProviderProfile(env: NodeJS.ProcessEnv = process.env): ProviderProfile {
  const explicit = (env.COWORK_PROFILE ?? '').trim().toLowerCase();
  const legacyRaw = (env.COWORK_PROMPT_ENHANCER_PROVIDER ?? '').trim().toLowerCase();
  const legacy = legacyRaw ? (PROFILE_ALIASES[legacyRaw] ?? legacyRaw) : '';
  if (explicit && legacy && explicit !== legacy) {
    throw new Error('COWORK_PROFILE conflicts with COWORK_PROMPT_ENHANCER_PROVIDER');
  }
  const profile = explicit || legacy || 'mock';
  if (!['mock', 'local', 'openai-compatible'].includes(profile)) {
    throw new Error(`Unsupported provider profile '${profile}'`);
  }
  return profile as ProviderProfile;
}

export const PROFILE = resolveProviderProfile();

export const PORT = Number(process.env.COWORK_PORT ?? 8080);
export const HOST = process.env.COWORK_HOST ?? '127.0.0.1';
export const ALLOW_REMOTE = process.env.COWORK_ALLOW_REMOTE === 'true';
export const AUTH_SECRET = process.env.COWORK_AUTH_SECRET ?? '';
export const MAX_FRAME_BYTES = Number(process.env.COWORK_MAX_FRAME_BYTES ?? DEFAULT_MAX_FRAME_BYTES);
export const MAX_PAYLOAD_BYTES = Number(process.env.COWORK_MAX_PAYLOAD_BYTES ?? DEFAULT_MAX_PAYLOAD_BYTES);
export const MAX_ACTIVE_COMMANDS = Number(process.env.COWORK_MAX_ACTIVE_COMMANDS ?? 4);
export const MAX_SESSION_COMMANDS = Number(process.env.COWORK_MAX_SESSION_COMMANDS ?? 2);
export const MAX_QUEUED_COMMANDS = Number(process.env.COWORK_MAX_QUEUED_COMMANDS ?? 32);
export const COMMAND_TIMEOUT_MS = Number(process.env.COWORK_COMMAND_TIMEOUT_MS ?? 600_000);
export const METRICS_ENABLED = process.env.COWORK_METRICS === 'true';

export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function positiveInteger(value: number, variable: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${variable} must be a positive integer`);
}

/**
 * Python interpreter for tools that spawn Python processes — RFC-0005 § 3, RFC-0006.
 * Default: the modules' shared venv (self-contained, with the llama-cpp GPU wheel).
 * Override via COWORK_PYTHON to use a different interpreter.
 */
const VENV_PYTHON =
  process.platform === 'win32'
    ? join(import.meta.dir, 'modules', '.venv', 'Scripts', 'python.exe')
    : join(import.meta.dir, 'modules', '.venv', 'bin', 'python');
export const PYTHON_BIN =
  process.env.COWORK_PYTHON ??
  (existsSync(VENV_PYTHON) ? VENV_PYTHON : process.platform === 'win32' ? 'python' : 'python3');

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
export const LLAMA_SERVER_BIN =
  process.env.COWORK_LLAMA_SERVER_BIN ??
  join(import.meta.dir, 'bin', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
export const LLAMA_SERVER_HOST = process.env.COWORK_LLAMA_SERVER_HOST ?? '127.0.0.1';
export const LLAMA_SERVER_PORT = Number(process.env.COWORK_LLAMA_SERVER_PORT ?? 8081);
export const LLAMA_SERVER_URL = `http://${LLAMA_SERVER_HOST}:${LLAMA_SERVER_PORT}`;

export function assertValidConfig(env: NodeJS.ProcessEnv = process.env): void {
  const profile = resolveProviderProfile(env);
  const port = Number(env.COWORK_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('COWORK_PORT must be a valid port');
  const host = (env.COWORK_HOST ?? '127.0.0.1').trim();
  if (!host) throw new Error('COWORK_HOST cannot be empty');
  const remote = !isLoopbackHost(host);
  if (remote && env.COWORK_ALLOW_REMOTE !== 'true') {
    throw new Error('Non-loopback binding requires COWORK_ALLOW_REMOTE=true');
  }
  if (remote && (env.COWORK_AUTH_SECRET ?? '').length < 32) {
    throw new Error('Non-loopback binding requires COWORK_AUTH_SECRET with at least 32 characters');
  }
  if (remote && env.COWORK_METRICS === 'true') {
    throw new Error('COWORK_METRICS is supported only on a loopback binding');
  }
  const maxFrame = Number(env.COWORK_MAX_FRAME_BYTES ?? DEFAULT_MAX_FRAME_BYTES);
  const maxPayload = Number(env.COWORK_MAX_PAYLOAD_BYTES ?? DEFAULT_MAX_PAYLOAD_BYTES);
  const maxActive = Number(env.COWORK_MAX_ACTIVE_COMMANDS ?? 4);
  const maxSession = Number(env.COWORK_MAX_SESSION_COMMANDS ?? 2);
  const maxQueued = Number(env.COWORK_MAX_QUEUED_COMMANDS ?? 32);
  const timeout = Number(env.COWORK_COMMAND_TIMEOUT_MS ?? 600_000);
  positiveInteger(maxFrame, 'COWORK_MAX_FRAME_BYTES');
  positiveInteger(maxPayload, 'COWORK_MAX_PAYLOAD_BYTES');
  positiveInteger(maxActive, 'COWORK_MAX_ACTIVE_COMMANDS');
  positiveInteger(maxSession, 'COWORK_MAX_SESSION_COMMANDS');
  positiveInteger(maxQueued, 'COWORK_MAX_QUEUED_COMMANDS');
  positiveInteger(timeout, 'COWORK_COMMAND_TIMEOUT_MS');
  if (maxPayload > maxFrame) throw new Error('COWORK_MAX_PAYLOAD_BYTES cannot exceed COWORK_MAX_FRAME_BYTES');
  if (maxSession > maxActive) throw new Error('COWORK_MAX_SESSION_COMMANDS cannot exceed COWORK_MAX_ACTIVE_COMMANDS');
  if (profile === 'mock') {
    const scenario = env.COWORK_MOCK_SCENARIO ?? 'success';
    if (!['success', 'malformed', 'context_overflow', 'timeout', 'provider_failure'].includes(scenario)) {
      throw new Error(`Unsupported COWORK_MOCK_SCENARIO '${scenario}'`);
    }
    const delay = Number(env.COWORK_MOCK_DELAY_MS ?? 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > 60_000) {
      throw new Error('COWORK_MOCK_DELAY_MS must be between 0 and 60000');
    }
    return;
  }
  if (profile === 'local') {
    if (!existsSync(LLAMA_SERVER_BIN)) throw new Error(`Local provider executable not found: ${LLAMA_SERVER_BIN}`);
    if (!existsSync(PROMPT_MODEL_PATH)) throw new Error(`Local provider model not found: ${PROMPT_MODEL_PATH}`);
    return;
  }
  const required = ['COWORK_OPENAI_BASE_URL', 'COWORK_OPENAI_MODEL', 'COWORK_OPENAI_API_KEY'] as const;
  const missing = required.filter((name) => !(env[name] ?? '').trim());
  if (missing.length) throw new Error(`openai-compatible profile requires ${missing.join(', ')}`);
  try {
    const url = new URL(env.COWORK_OPENAI_BASE_URL!);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new Error('COWORK_OPENAI_BASE_URL must be an absolute HTTP(S) URL');
  }
}

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
