import { describe, expect, test } from 'bun:test';
import { disposeModelSession } from './local-session';

describe('local model session disposal', () => {
  test('awaits the model release hook exactly once', async () => {
    let releases = 0;
    await disposeModelSession({ dispose: async () => void releases++ });
    expect(releases).toBe(1);
  });

  test('contains a disposal failure so the cache reference can still be cleared', async () => {
    await expect(
      disposeModelSession({ dispose: () => Promise.reject(new Error('device lost')) })
    ).resolves.toBeUndefined();
  });
});
