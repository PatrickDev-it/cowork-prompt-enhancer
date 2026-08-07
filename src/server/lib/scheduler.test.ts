import { describe, expect, test } from 'bun:test';
import { BoundedScheduler, SchedulerError } from './scheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('bounded command scheduler', () => {
  test('enforces global and per-session concurrency while draining fairly', async () => {
    const scheduler = new BoundedScheduler({ maxActive: 2, maxPerSession: 1, maxQueued: 3, timeoutMs: 2_000 });
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    let secondStarted = false;
    const p1 = scheduler.schedule('a', '1', () => first.promise);
    const p2 = scheduler.schedule('a', '2', () => {
      secondStarted = true;
      return second.promise;
    });
    const p3 = scheduler.schedule('b', '3', () => third.promise);
    expect(scheduler.stats()).toMatchObject({ active: 2, queued: 1 });
    expect(secondStarted).toBeFalse();
    first.resolve('one');
    expect(await p1).toBe('one');
    await Bun.sleep(0);
    expect(secondStarted).toBeTrue();
    second.resolve('two');
    third.resolve('three');
    expect(await Promise.all([p2, p3])).toEqual(['two', 'three']);
    expect(scheduler.stats()).toMatchObject({ active: 0, queued: 0 });
  });

  test('fails fast when the bounded queue is full', async () => {
    const scheduler = new BoundedScheduler({ maxActive: 1, maxPerSession: 1, maxQueued: 1, timeoutMs: 2_000 });
    const running = deferred<void>();
    const p1 = scheduler.schedule('a', '1', () => running.promise);
    const queued = scheduler.schedule('b', '2', async () => undefined);
    await expect(scheduler.schedule('c', '3', async () => undefined)).rejects.toMatchObject({ code: 'overloaded' });
    running.resolve();
    await Promise.all([p1, queued]);
  });

  test('propagates cancellation and deadlines through AbortSignal', async () => {
    const scheduler = new BoundedScheduler({ maxActive: 1, maxPerSession: 1, maxQueued: 1, timeoutMs: 20 });
    let cancellationObserved = false;
    const cancelled = scheduler.schedule(
      'a',
      'cancel-me',
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            cancellationObserved = true;
            reject(signal.reason);
          });
        })
    );
    expect(scheduler.cancel('a', 'cancel-me')).toBeTrue();
    await expect(cancelled).rejects.toEqual(new SchedulerError('cancelled', 'Command cancelled'));
    expect(cancellationObserved).toBeTrue();

    const timedOut = scheduler.schedule(
      'a',
      'timeout-me',
      (signal) => new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    );
    await expect(timedOut).rejects.toMatchObject({ code: 'timeout' });
    await Bun.sleep(0);
    expect(scheduler.stats()).toMatchObject({ active: 0, queued: 0 });
  });

  test('counts queue wait against the deadline', async () => {
    const callbacks: Array<() => void> = [];
    const scheduler = new BoundedScheduler(
      { maxActive: 1, maxPerSession: 1, maxQueued: 1, timeoutMs: 100 },
      {
        set: (callback) => {
          callbacks.push(callback);
          return callback as unknown as ReturnType<typeof setTimeout>;
        },
        clear: () => undefined,
      }
    );
    const running = deferred<void>();
    const first = scheduler.schedule('a', 'first', () => running.promise);
    const queued = scheduler.schedule('b', 'queued', async () => undefined);
    callbacks[1]!();
    await expect(queued).rejects.toMatchObject({ code: 'timeout' });
    running.resolve();
    await first;
  });
});
