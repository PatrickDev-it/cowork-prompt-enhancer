import { dirname } from 'node:path';
import { LLAMA_SERVER_BIN, LLAMA_SERVER_URL, llamaServerArgs } from '@/config';

/**
 * Supervisor for the `llama-server` process — RFC-0014/0015. **Shared LLM infrastructure**: the
 * model is loaded once and used across every module (prompt_enhancer, context_compressor, future
 * ones) via the OpenAI API. Owns the process lifecycle: automatic startup, health checks
 * (`/health`), backoff restart on crash, clean shutdown. Extracted out of
 * `prompt_enhancer/llama_server.ts` (RFC-0014) to make it shared (RFC-0015).
 */

let proc: Bun.Subprocess | null = null;
let restarts = 0;
let stopping = false;

const MAX_RESTARTS = Number(process.env.COWORK_LLAMA_RESTART_MAX ?? 5);
const BACKOFF_MS = Number(process.env.COWORK_LLAMA_RESTART_BACKOFF_MS ?? 1000);
const HEALTH_TIMEOUT_MS = Number(process.env.COWORK_LLAMA_HEALTH_TIMEOUT_MS ?? 120000);

function log(message: string): void {
  console.log(`[llama-server] ${message}`);
}

function pump(stream: ReadableStream<Uint8Array> | undefined): void {
  if (!stream) return;
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (line) log(line);
      }
    }
  })();
}

function spawn(): void {
  proc = Bun.spawn([LLAMA_SERVER_BIN, ...llamaServerArgs()], {
    // cwd = cartella dell'exe così Windows carica le DLL CUDA vendored accanto ad esso.
    cwd: dirname(LLAMA_SERVER_BIN),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  pump(proc.stdout as ReadableStream<Uint8Array>);
  pump(proc.stderr as ReadableStream<Uint8Array>);

  proc.exited.then((code) => {
    proc = null;
    if (stopping) return;
    if (restarts < MAX_RESTARTS) {
      restarts += 1;
      const delay = BACKOFF_MS * restarts;
      log(`processo uscito (code ${code}); restart ${restarts}/${MAX_RESTARTS} tra ${delay}ms`);
      setTimeout(spawn, delay);
    } else {
      log(`crashato ${MAX_RESTARTS} volte di fila: supervisione interrotta. Controllare la config/VRAM.`);
    }
  });
}

/** Starts the server if it isn't already alive — fire-and-forget (doesn't block `Bun.serve`). */
export function startLlm(): void {
  if (proc) return;
  log(`avvio ${LLAMA_SERVER_BIN} ${llamaServerArgs().join(' ')}`);
  spawn();
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${LLAMA_SERVER_URL}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Guarantees the server is ready before serving a request (the first one waits for the model to
 * load, then it stays warm). Starts it if needed and polls `/health`.
 */
export async function ensureLlmReady(): Promise<void> {
  startLlm();
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy()) {
      restarts = 0; // caricamento riuscito: azzera il contatore per i crash transitori futuri.
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error(`llama-server non è diventato sano entro ${HEALTH_TIMEOUT_MS}ms`);
}

/** Clean shutdown: no restart, kills the process. */
export function stopLlm(): void {
  stopping = true;
  proc?.kill();
  proc = null;
}

// L'infra LLM possiede il ciclo di vita del suo processo: si pulisce da sola all'uscita del server,
// indipendentemente da quale modulo lo abbia avviato.
process.once('exit', stopLlm);
process.once('SIGINT', stopLlm);
process.once('SIGTERM', stopLlm);
