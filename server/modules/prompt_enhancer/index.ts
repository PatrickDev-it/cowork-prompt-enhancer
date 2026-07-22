import { randomUUID } from 'node:crypto';
import { LLAMA_SERVER_URL, PROFILE, PROMPT_ENHANCER_DIR, PYTHON_BIN } from '@/config';
import { ensureLlmReady } from '@/modules/llm';

export interface EnhancementTrace {
  generationMs: number;
  providerMs: number;
  providerQueueMs: number;
  providerCalls: number;
  promptTokens: number;
  completionTokens: number;
  generationMode: string;
  fallbackUsed: boolean;
  grounded: boolean;
}

/**
 * Prompt-enhancer manager (RFC-0014). A persistent Python worker orchestrates generation through the
 * selected provider; only the local profile owns a supervised external llama-server process. Concurrent
 * JSON-lines requests are correlated by ID and bounded to the configured provider slot count.
 */

interface EnhanceResult {
  prompt: string;
  /** Deep-research report; non-empty only when explicitly requested and successfully produced. */
  research?: string;
  trace: EnhancementTrace;
}

interface WorkerResponse {
  id: string;
  prompt?: string;
  research?: string;
  error?: string;
  error_code?: string;
  trace?: Omit<EnhancementTrace, 'providerQueueMs'>;
}

export class EnhancementError extends Error {
  constructor(
    message: string,
    public readonly code: 'provider_error' | 'timeout' | 'internal_error'
  ) {
    super(message);
    this.name = 'EnhancementError';
  }
}

/** Optional request controls (RFC-0021 project context, RFC-0022 deep research). */
export interface EnhanceOptions {
  search?: boolean;
  projectContext?: string;
  deepResearch?: boolean;
  signal?: AbortSignal;
  correlationId?: string;
}

interface WorkerHandle {
  proc: Bun.PipedSubprocess;
}

let handle: WorkerHandle | null = null;

/** In-flight requests correlated by ID; responses may arrive out of order. */
const pending = new Map<string, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

/** Serialize atomic JSON-lines writes to stdin while processing remains concurrent. */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Application concurrency should match the local server's `--parallel` slot count (RFC-0024). The
 * default is four; override `COWORK_PROMPT_ENHANCER_CONCURRENCY` and `LLAMA_PARALLEL` together.
 */
const CONCURRENCY = Math.max(1, Number(process.env.COWORK_PROMPT_ENHANCER_CONCURRENCY ?? 4));
let inFlight = 0;
interface GateWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort: () => void;
}
const gate: GateWaiter[] = [];

function acquire(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (inFlight < CONCURRENCY) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: GateWaiter = {
      resolve,
      reject,
      signal,
      abort: () => {
        const index = gate.indexOf(waiter);
        if (index >= 0) gate.splice(index, 1);
        reject(signal?.reason instanceof Error ? signal.reason : new Error('Enhancement cancelled'));
      },
    };
    signal?.addEventListener('abort', waiter.abort, { once: true });
    gate.push(waiter);
  });
}

function release(): void {
  const next = gate.shift();
  if (next) {
    next.signal?.removeEventListener('abort', next.abort);
    next.resolve();
  } else inFlight -= 1;
}

/** Forward the worker's minimal stderr diagnostics. */
function pumpStderr(stream: ReadableStream<Uint8Array>): void {
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const message = raw.trim();
        if (message) console.log(`[prompt-enhancer] ${message}`);
      }
    }
  })();
}

/** Dispatch JSON-lines worker responses to the matching request ID. */
function pumpStdout(stream: ReadableStream<Uint8Array>): void {
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let response: WorkerResponse;
        try {
          response = JSON.parse(line);
        } catch {
          console.log(`[prompt-enhancer] ignored non-JSON worker line: ${line.slice(0, 120)}`);
          continue;
        }
        const waiter = pending.get(response.id);
        if (waiter) {
          pending.delete(response.id);
          waiter.resolve(response);
        }
      }
    }
    failAllPending(new Error('prompt-enhancer worker stdout closed'));
  })();
}

function failAllPending(err: Error): void {
  for (const [id, waiter] of pending) {
    pending.delete(id);
    waiter.reject(err);
  }
}

function spawnWorker(): WorkerHandle {
  const proc = Bun.spawn([PYTHON_BIN, 'cli.py', '--serve'], {
    cwd: PROMPT_ENHANCER_DIR,
    // The worker is an HTTP orchestrator with no embedded model or GPU dependency.
    env: { ...process.env, COWORK_LLAMA_SERVER_URL: LLAMA_SERVER_URL },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const created: WorkerHandle = { proc };
  pumpStdout(proc.stdout);
  pumpStderr(proc.stderr);

  proc.exited.then(() => {
    if (handle === created) handle = null;
    failAllPending(new Error('prompt-enhancer worker terminated'));
  });

  return created;
}

function ensureWorker(): WorkerHandle {
  if (!handle) handle = spawnWorker();
  return handle;
}

/**
 * Start the Python worker before the first request. Shared LLM infrastructure owns llama-server;
 * this module owns only the provider-orchestration worker.
 */
export function warmUpPromptEnhancer(): void {
  ensureWorker();
}

/**
 * Compile a request after local readiness, bounded by the provider concurrency window. `onLog` remains
 * for compatibility; lifecycle diagnostics are owned by the supervisor.
 */
export async function enhancePrompt(
  prompt: string,
  mode: string,
  think: boolean,
  _onLog: (line: string) => void,
  options: EnhanceOptions = {}
): Promise<EnhanceResult> {
  if (options.signal?.aborted) throw options.signal.reason;
  if (PROFILE === 'local') await ensureLlmReady(options.signal);
  const providerQueuedAt = performance.now();
  await acquire(options.signal);
  const providerQueueMs = performance.now() - providerQueuedAt;
  try {
    const worker = ensureWorker();
    const id = options.correlationId ?? randomUUID();
    const responsePromise = new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    const abort = () => {
      const reason = options.signal?.reason;
      const waiter = pending.get(id);
      if (waiter) {
        pending.delete(id);
        waiter.reject(reason instanceof Error ? reason : new Error('Enhancement cancelled'));
      }
      if (handle?.proc === worker.proc) {
        handle.proc.kill();
        handle = null;
      }
    };
    options.signal?.addEventListener('abort', abort, { once: true });

    // Send optional fields only when present; the worker owns their defaults.
    const request: Record<string, unknown> = { id, prompt, mode, think };
    if (options.search !== undefined) request.search = options.search;
    if (options.projectContext) request.project_context = options.projectContext;
    if (options.deepResearch) request.deep_research = true;

    writeChain = writeChain.then(async () => {
      await worker.proc.stdin.write(`${JSON.stringify(request)}\n`);
      await worker.proc.stdin.flush();
    });
    try {
      await writeChain;
    } catch (err) {
      pending.delete(id);
      options.signal?.removeEventListener('abort', abort);
      handle = null;
      writeChain = Promise.resolve();
      throw err instanceof Error ? err : new Error(String(err));
    }

    const response = await responsePromise.finally(() => options.signal?.removeEventListener('abort', abort));
    if (response.error) {
      const code =
        response.error_code === 'provider_timeout'
          ? 'timeout'
          : response.error_code?.startsWith('provider_')
            ? 'provider_error'
            : 'internal_error';
      throw new EnhancementError(response.error, code);
    }
    if (typeof response.prompt !== 'string' || !response.prompt) {
      throw new Error('The prompt-enhancer worker produced no prompt.');
    }
    const trace = response.trace;
    return {
      prompt: response.prompt,
      research: response.research ?? '',
      trace: {
        generationMs: trace?.generationMs ?? 0,
        providerMs: trace?.providerMs ?? 0,
        providerQueueMs,
        providerCalls: trace?.providerCalls ?? 0,
        promptTokens: trace?.promptTokens ?? 0,
        completionTokens: trace?.completionTokens ?? 0,
        generationMode: trace?.generationMode ?? 'unknown',
        fallbackUsed: trace?.fallbackUsed ?? false,
        grounded: trace?.grounded ?? false,
      },
    };
  } finally {
    release();
  }
}

function shutdownWorker(): void {
  handle?.proc.kill();
  // Shared LLM infrastructure owns llama-server shutdown.
}

process.once('exit', shutdownWorker);
process.once('SIGINT', () => {
  shutdownWorker();
  process.exit(0);
});
process.once('SIGTERM', () => {
  shutdownWorker();
  process.exit(0);
});
