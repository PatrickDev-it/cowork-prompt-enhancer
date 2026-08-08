import { describe, expect, test } from 'bun:test';
import { formatMemory, measureBrowserMemory } from './memory';

describe('browser memory diagnostics', () => {
  test('uses isolated agent memory when the browser exposes it', async () => {
    const snapshot = await measureBrowserMemory({
      measureUserAgentSpecificMemory: async () => ({ bytes: 1_500_000_000 }),
      memory: { usedJSHeapSize: 2_000_000 },
    });
    expect(snapshot).toEqual({ bytes: 1_500_000_000, source: 'agent' });
  });

  test('falls back to the JavaScript heap and labels the limitation', async () => {
    const snapshot = await measureBrowserMemory({ memory: { usedJSHeapSize: 320_000_000 } });
    expect(snapshot).toEqual({ bytes: 320_000_000, source: 'js-heap' });
  });

  test('formats only measured byte values', () => {
    expect(formatMemory(1_500_000_000)).toBe('1.5 GB');
  });
});
