export class SchedulerError extends Error {
  constructor(
    public readonly code: 'overloaded' | 'cancelled' | 'timeout',
    message: string
  ) {
    super(message);
    this.name = 'SchedulerError';
  }
}

interface QueuedTask<T> {
  sessionId: string;
  commandId: string;
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  controller: AbortController;
  timeout?: ReturnType<typeof setTimeout>;
}

export interface SchedulerOptions {
  maxActive: number;
  maxPerSession: number;
  maxQueued: number;
  timeoutMs: number;
}

export interface SchedulerTimers {
  set(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}

const systemTimers: SchedulerTimers = { set: setTimeout, clear: clearTimeout };

export class BoundedScheduler {
  private active = 0;
  private readonly activeBySession = new Map<string, number>();
  private readonly queue: QueuedTask<unknown>[] = [];
  private readonly tasks = new Map<string, QueuedTask<unknown>>();

  constructor(
    private readonly options: SchedulerOptions,
    private readonly timers: SchedulerTimers = systemTimers
  ) {
    for (const [name, value] of Object.entries(options)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    }
    if (options.maxPerSession > options.maxActive) throw new Error('maxPerSession cannot exceed maxActive');
  }

  schedule<T>(sessionId: string, commandId: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const key = this.taskKey(sessionId, commandId);
    if (this.tasks.has(key)) return Promise.reject(new SchedulerError('overloaded', 'Command is already active'));
    const canStart = this.canStart(sessionId);
    if (!canStart && this.queue.length >= this.options.maxQueued) {
      return Promise.reject(new SchedulerError('overloaded', 'Command queue is full'));
    }
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        sessionId,
        commandId,
        run,
        resolve,
        reject,
        controller: new AbortController(),
      };
      this.tasks.set(key, task as QueuedTask<unknown>);
      task.timeout = this.timers.set(
        () =>
          this.abortTask(
            task as QueuedTask<unknown>,
            new SchedulerError('timeout', `Command exceeded ${this.options.timeoutMs}ms`)
          ),
        this.options.timeoutMs
      );
      if (canStart) this.start(task as QueuedTask<unknown>);
      else this.queue.push(task as QueuedTask<unknown>);
    });
  }

  cancel(sessionId: string, commandId: string): boolean {
    const key = this.taskKey(sessionId, commandId);
    const task = this.tasks.get(key);
    if (!task) return false;
    this.abortTask(task, new SchedulerError('cancelled', 'Command cancelled'));
    return true;
  }

  cancelSession(sessionId: string): void {
    for (const task of [...this.tasks.values()]) {
      if (task.sessionId === sessionId) this.cancel(sessionId, task.commandId);
    }
  }

  stats(): { active: number; queued: number; activeBySession: ReadonlyMap<string, number> } {
    return { active: this.active, queued: this.queue.length, activeBySession: new Map(this.activeBySession) };
  }

  private canStart(sessionId: string): boolean {
    return (
      this.active < this.options.maxActive && (this.activeBySession.get(sessionId) ?? 0) < this.options.maxPerSession
    );
  }

  private start(task: QueuedTask<unknown>): void {
    this.active += 1;
    this.activeBySession.set(task.sessionId, (this.activeBySession.get(task.sessionId) ?? 0) + 1);
    void task
      .run(task.controller.signal)
      .then(task.resolve, (error: unknown) => {
        if (task.controller.signal.aborted) {
          const reason = task.controller.signal.reason;
          task.reject(reason instanceof Error ? reason : new SchedulerError('cancelled', 'Command cancelled'));
          return;
        }
        task.reject(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        if (task.timeout) this.timers.clear(task.timeout);
        this.tasks.delete(this.taskKey(task.sessionId, task.commandId));
        this.active -= 1;
        const remaining = (this.activeBySession.get(task.sessionId) ?? 1) - 1;
        if (remaining > 0) this.activeBySession.set(task.sessionId, remaining);
        else this.activeBySession.delete(task.sessionId);
        this.drain();
      });
  }

  private drain(): void {
    for (let index = 0; index < this.queue.length && this.active < this.options.maxActive; ) {
      const task = this.queue[index]!;
      if (!this.canStart(task.sessionId)) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      this.start(task);
    }
  }

  private taskKey(sessionId: string, commandId: string): string {
    return `${sessionId}:${commandId}`;
  }

  private abortTask(task: QueuedTask<unknown>, error: SchedulerError): void {
    task.controller.abort(error);
    const index = this.queue.indexOf(task);
    if (index < 0) return;
    this.queue.splice(index, 1);
    this.tasks.delete(this.taskKey(task.sessionId, task.commandId));
    if (task.timeout) this.timers.clear(task.timeout);
    task.reject(error);
    this.drain();
  }
}
