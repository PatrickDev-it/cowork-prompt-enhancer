import { describe, expect, test } from 'bun:test';
import { createRequestTrace, MetricsRegistry } from './metrics';

describe('bounded request metrics', () => {
  test('retains a bounded credential-free trace window and aggregate outcomes', () => {
    const registry = new MetricsRegistry(2);
    for (let index = 0; index < 3; index++) {
      const trace = createRequestTrace();
      trace.fallbackUsed = index === 1;
      registry.record({
        correlationId: `request-${index}`,
        tool: 'prompt-enhancer',
        outcome: index === 2 ? 'error' : 'success',
        trace,
      });
    }

    const snapshot = registry.snapshot({ active: 1, queued: 2 }) as {
      totals: { requests: number; failed: number; fallbacks: number };
      recent: Array<{ correlationId: string }>;
    };
    expect(snapshot.totals).toEqual({ requests: 3, failed: 1, fallbacks: 1 });
    expect(snapshot.recent.map((record) => record.correlationId)).toEqual(['request-1', 'request-2']);
    expect(JSON.stringify(snapshot)).not.toContain('prompt content');
  });
});
