import { describe, expect, test } from 'bun:test';
import {
  installSupervisorSignalHandlers,
  LlamaSupervisor,
  type SupervisorChild,
  type SupervisorDependencies,
} from './supervisor';

function childDouble() {
  let exit!: (code: number) => void;
  let killed = false;
  const child: SupervisorChild = {
    exited: new Promise<number>((resolve) => {
      exit = resolve;
    }),
    kill: () => {
      killed = true;
      exit(0);
    },
  };
  return { child, exit, killed: () => killed };
}

function harness(healthValues: boolean[] = [true]) {
  let now = 0;
  const children: ReturnType<typeof childDouble>[] = [];
  const scheduled: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  const logs: string[] = [];
  const dependencies: SupervisorDependencies = {
    spawn: () => {
      const next = childDouble();
      children.push(next);
      return next.child;
    },
    health: async () => healthValues.shift() ?? false,
    sleep: async (ms) => {
      now += ms;
    },
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      scheduled.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    cancelSchedule: (raw) => {
      (raw as unknown as { cancelled: boolean }).cancelled = true;
    },
    now: () => now,
    log: (message) => logs.push(message),
  };
  const supervisor = new LlamaSupervisor(dependencies, {
    maxRestarts: 2,
    restartBaseMs: 10,
    healthTimeoutMs: 30,
    healthPollMs: 10,
  });
  return { supervisor, children, scheduled, logs };
}

describe('llama supervisor failure injection', () => {
  test('starts once and reaches healthy readiness', async () => {
    const { supervisor, children } = harness([false, true]);
    await supervisor.ensureReady();
    expect(children).toHaveLength(1);
    expect(supervisor.state()).toMatchObject({ running: true, restarts: 0 });
    supervisor.stop();
    expect(children[0]!.killed()).toBeTrue();
  });

  test('fails a bounded health timeout', async () => {
    const { supervisor } = harness([false, false, false, false]);
    await expect(supervisor.ensureReady()).rejects.toThrow('did not become healthy');
    supervisor.stop();
  });

  test('uses exponential restart and enforces the restart cap', async () => {
    const { supervisor, children, scheduled, logs } = harness();
    supervisor.start();
    children[0]!.exit(1);
    await Bun.sleep(0);
    expect(scheduled[0]?.delay).toBe(10);
    scheduled[0]!.callback();
    children[1]!.exit(2);
    await Bun.sleep(0);
    expect(scheduled[1]?.delay).toBe(20);
    scheduled[1]!.callback();
    children[2]!.exit(3);
    await Bun.sleep(0);
    expect(scheduled).toHaveLength(2);
    expect(logs.some((line) => line.includes('restart cap reached'))).toBeTrue();
  });

  test('clean shutdown cancels restart and kills the owned child without respawn', async () => {
    const { supervisor, children, scheduled } = harness();
    supervisor.start();
    children[0]!.exit(1);
    await Bun.sleep(0);
    expect(scheduled).toHaveLength(1);
    supervisor.stop();
    expect(scheduled[0]!.cancelled).toBeTrue();
    scheduled[0]!.callback();
    expect(children).toHaveLength(1);

    const second = harness();
    second.supervisor.start();
    second.supervisor.stop();
    expect(second.children[0]!.killed()).toBeTrue();
    expect(second.supervisor.state()).toMatchObject({ running: false, stopping: true });
  });

  test('SIGINT and SIGTERM both stop ownership before exiting', () => {
    const handlers = new Map<string, () => void>();
    const target = { once: (event: string, listener: () => void) => handlers.set(event, listener) };
    const actions: string[] = [];
    installSupervisorSignalHandlers(
      target,
      () => actions.push('stop'),
      (code) => actions.push(`exit:${code}`)
    );
    handlers.get('SIGINT')!();
    handlers.get('SIGTERM')!();
    expect(actions).toEqual(['stop', 'exit:0', 'stop', 'exit:0']);
  });
});
