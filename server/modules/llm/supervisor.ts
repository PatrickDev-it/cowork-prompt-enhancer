import { dirname } from 'node:path';
import { LLAMA_SERVER_BIN, LLAMA_SERVER_URL, llamaServerArgs } from '@/config';

export interface SupervisorChild {
  exited: Promise<number>;
  kill(): void;
}

export interface SupervisorDependencies {
  spawn: () => SupervisorChild;
  health: (signal?: AbortSignal) => Promise<boolean>;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  schedule: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelSchedule: (timer: ReturnType<typeof setTimeout>) => void;
  now: () => number;
  log: (message: string) => void;
}

export interface SupervisorOptions {
  maxRestarts: number;
  restartBaseMs: number;
  healthTimeoutMs: number;
  healthPollMs: number;
}

function pump(stream: ReadableStream<Uint8Array> | undefined, log: (message: string) => void): void {
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

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function productionDependencies(): SupervisorDependencies {
  const log = (message: string) => console.log(`[llama-server] ${message}`);
  return {
    spawn: () => {
      const process = Bun.spawn([LLAMA_SERVER_BIN, ...llamaServerArgs()], {
        cwd: dirname(LLAMA_SERVER_BIN),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      pump(process.stdout as ReadableStream<Uint8Array>, log);
      pump(process.stderr as ReadableStream<Uint8Array>, log);
      return process;
    },
    health: async (signal) => {
      try {
        const timeout = AbortSignal.timeout(4_000);
        const response = await fetch(`${LLAMA_SERVER_URL}/health`, {
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (!response.ok) return false;
        const body = (await response.json()) as { status?: string };
        return body.status === 'ok';
      } catch {
        return false;
      }
    },
    sleep: abortableSleep,
    schedule: setTimeout,
    cancelSchedule: clearTimeout,
    now: Date.now,
    log,
  };
}

export class LlamaSupervisor {
  private child: SupervisorChild | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartCount = 0;
  private stopping = false;

  constructor(
    private readonly dependencies: SupervisorDependencies,
    private readonly options: SupervisorOptions
  ) {}

  start(): void {
    if (this.child || this.restartTimer) return;
    this.stopping = false;
    this.spawnChild();
  }

  async ensureReady(signal?: AbortSignal): Promise<void> {
    this.start();
    const deadline = this.dependencies.now() + this.options.healthTimeoutMs;
    while (this.dependencies.now() < deadline) {
      if (signal?.aborted) throw signal.reason;
      if (await this.dependencies.health(signal)) {
        this.restartCount = 0;
        return;
      }
      await this.dependencies.sleep(this.options.healthPollMs, signal);
    }
    throw new Error(`llama-server did not become healthy within ${this.options.healthTimeoutMs}ms`);
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      this.dependencies.cancelSchedule(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  state(): { running: boolean; restarts: number; restartScheduled: boolean; stopping: boolean } {
    return {
      running: this.child !== null,
      restarts: this.restartCount,
      restartScheduled: this.restartTimer !== null,
      stopping: this.stopping,
    };
  }

  private spawnChild(): void {
    if (this.stopping || this.child) return;
    this.dependencies.log(`starting ${LLAMA_SERVER_BIN}`);
    const child = this.dependencies.spawn();
    this.child = child;
    void child.exited.then((code) => this.handleExit(child, code));
  }

  private handleExit(child: SupervisorChild, code: number): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.stopping) return;
    if (this.restartCount >= this.options.maxRestarts) {
      this.dependencies.log(`restart cap reached after ${this.options.maxRestarts} failures (last exit ${code})`);
      return;
    }
    this.restartCount += 1;
    const delay = this.options.restartBaseMs * 2 ** (this.restartCount - 1);
    this.dependencies.log(
      `process exited (${code}); restart ${this.restartCount}/${this.options.maxRestarts} in ${delay}ms`
    );
    this.restartTimer = this.dependencies.schedule(() => {
      this.restartTimer = null;
      this.spawnChild();
    }, delay);
  }
}

const supervisor = new LlamaSupervisor(productionDependencies(), {
  maxRestarts: Math.max(0, Number(process.env.COWORK_LLAMA_RESTART_MAX ?? 5)),
  restartBaseMs: Math.max(1, Number(process.env.COWORK_LLAMA_RESTART_BACKOFF_MS ?? 1_000)),
  healthTimeoutMs: Math.max(1, Number(process.env.COWORK_LLAMA_HEALTH_TIMEOUT_MS ?? 120_000)),
  healthPollMs: 500,
});

export function startLlm(): void {
  supervisor.start();
}

export function ensureLlmReady(signal?: AbortSignal): Promise<void> {
  return supervisor.ensureReady(signal);
}

export function stopLlm(): void {
  supervisor.stop();
}

export interface ProcessSignalTarget {
  once(event: 'exit' | 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

export function installSupervisorSignalHandlers(
  target: ProcessSignalTarget,
  stop: () => void,
  exit: (code: number) => void
): void {
  target.once('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    target.once(signal, () => {
      stop();
      exit(0);
    });
  }
}

installSupervisorSignalHandlers(process, stopLlm, (code) => process.exit(code));
