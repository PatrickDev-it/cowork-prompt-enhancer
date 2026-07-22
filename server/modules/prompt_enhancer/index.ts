import { randomUUID } from 'node:crypto';
import { LLAMA_SERVER_URL, PROFILE, PROMPT_ENHANCER_DIR, PYTHON_BIN } from '@/config';
import { ensureLlmReady } from '@/modules/llm';

/**
 * Manager del prompt-enhancer — RFC-0014 (supera il worker in-process di RFC-0010). Due processi
 * supervisionati: (1) `llama-server` esterno che tiene il modello e serve l'API OpenAI-compatible
 * (ciclo di vita in `llama_server.ts`); (2) un worker Python persistente (`cli.py --serve`) che
 * orchestra la generazione e parla al server **solo via API OpenAI** (engine.py = client HTTP,
 * niente più `Llama()` in-process).
 *
 * Concorrenza (RFC-0014, requisito 9): il server gira con `--parallel N` (continuous batching). Il
 * worker Python processa le richieste in thread concorrenti; qui le richieste sono correlate per
 * `id` (le risposte possono tornare fuori ordine) con una finestra di concorrenza configurabile
 * (`COWORK_PROMPT_ENHANCER_CONCURRENCY`). Il contratto sul filo resta JSON-lines.
 */

interface EnhanceResult {
  prompt: string;
  /** Report di deep-research (RFC-0022): presente e non vuoto solo se `deepResearch` era attivo. */
  research?: string;
}

interface WorkerResponse {
  id: string;
  prompt?: string;
  research?: string;
  error?: string;
}

/** Parametri opzionali del run — RFC-0021 (project_context), RFC-0022 (deep_research). */
export interface EnhanceOptions {
  search?: boolean;
  projectContext?: string;
  deepResearch?: boolean;
}

interface WorkerHandle {
  proc: Bun.PipedSubprocess;
}

let handle: WorkerHandle | null = null;

/** Richieste in volo, correlate per id (le risposte arrivano potenzialmente fuori ordine). */
const pending = new Map<string, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

/** Serializza le SCRITTURE su stdin (una riga JSON atomica per volta); il PROCESSING resta concorrente. */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Finestra di concorrenza lato app: **deve combaciare con `--parallel` del server** (RFC-0024) — se il
 * worker manda più richieste degli slot, si crea una coda inutile; se ne manda meno, gli slot restano idle.
 * Default 4 = 4 slot llama-server (config production 3-4 utenti, benchmark 2026-07-08). Override coerente:
 * cambiare INSIEME `COWORK_PROMPT_ENHANCER_CONCURRENCY` e `LLAMA_PARALLEL`.
 */
const CONCURRENCY = Math.max(1, Number(process.env.COWORK_PROMPT_ENHANCER_CONCURRENCY ?? 4));
let inFlight = 0;
const gate: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < CONCURRENCY) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => gate.push(resolve));
}

function release(): void {
  const next = gate.shift();
  if (next) next();
  else inFlight -= 1;
}

/** Log del worker (stderr): minimale ormai (il modello è in llama-server). Va sulla console. */
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

/** Legge le righe JSON del worker e le smista alla richiesta corrispondente per `id`. */
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
          console.log(`[prompt-enhancer] riga non-JSON ignorata: ${line.slice(0, 120)}`);
          continue;
        }
        const waiter = pending.get(response.id);
        if (waiter) {
          pending.delete(response.id);
          waiter.resolve(response);
        }
      }
    }
    // stdout chiuso: il worker è morto, fallisci tutte le richieste in volo.
    failAllPending(new Error('stdout del worker prompt-enhancer chiuso'));
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
    // Il worker non carica più un modello: è un orchestratore che parla a llama-server via HTTP.
    // Gli passiamo l'URL del server (RFC-0014). Nessuna dipendenza GPU/CUDA nel processo Python.
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
    failAllPending(new Error('worker prompt-enhancer terminato'));
  });

  return created;
}

function ensureWorker(): WorkerHandle {
  if (!handle) handle = spawnWorker();
  return handle;
}

/**
 * Avvia il worker Python subito, senza attendere una richiesta reale — RFC-0014/0015. Il modello
 * (llama-server) è avviato dall'infra LLM condivisa (`@/modules/llm`, in `server/index.ts`), non
 * qui: prompt_enhancer è solo un consumatore del modello condiviso. Spawn fire-and-forget.
 */
export function warmUpPromptEnhancer(): void {
  ensureWorker();
}

/**
 * Potenzia un prompt. Attende `/health` del server (semantica RFC-0010: la prima richiesta attende
 * il caricamento), poi invia al worker sotto una finestra di concorrenza (RFC-0014). Le richieste
 * concorrenti sono correlate per `id` e aggregate da llama-server (continuous batching). `onLog`
 * resta nell'API per compatibilità; il log significativo (caricamento modello) è ora del supervisor.
 */
export async function enhancePrompt(
  prompt: string,
  mode: string,
  think: boolean,
  _onLog: (line: string) => void,
  options: EnhanceOptions = {}
): Promise<EnhanceResult> {
  if (PROFILE === 'local') await ensureLlmReady();
  await acquire();
  try {
    const worker = ensureWorker();
    const id = randomUUID();
    const responsePromise = new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });

    // Campi opzionali inviati solo se presenti: il worker Python li tratta come default se assenti
    // (search=None ⇒ gate RFC-0020; project_context="" ; deep_research=false).
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
      handle = null; // trasporto rotto: si ricrea il worker alla prossima richiesta.
      throw err instanceof Error ? err : new Error(String(err));
    }

    const response = await responsePromise;
    if (response.error) throw new Error(response.error);
    if (typeof response.prompt !== 'string' || !response.prompt) {
      throw new Error('Il worker prompt-enhancer non ha prodotto alcun prompt.');
    }
    return { prompt: response.prompt, research: response.research ?? '' };
  } finally {
    release();
  }
}

function shutdownWorker(): void {
  handle?.proc.kill();
  // Il modello condiviso (llama-server) è fermato dall'infra LLM (@/modules/llm), non qui.
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
