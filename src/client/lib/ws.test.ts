import { describe, expect, test } from 'bun:test';
import { $WS, reconnectDelay } from './ws';

describe('client reconnect policy', () => {
  test('uses bounded exponential backoff with jitter', () => {
    expect(reconnectDelay(1, 250, 5_000, () => 0.5)).toBe(250);
    expect(reconnectDelay(2, 250, 5_000, () => 0.5)).toBe(500);
    expect(reconnectDelay(9, 250, 5_000, () => 0.5)).toBe(5_000);
    expect(reconnectDelay(1, 250, 5_000, () => 0)).toBe(200);
    expect(reconnectDelay(1, 250, 5_000, () => 1)).toBe(300);
  });

  test('bounds unsent commands while disconnected', () => {
    const connection = new $WS('ws://127.0.0.1:1', 'client', { maxReconnectAttempts: 0 });
    for (let index = 0; index < 64; index += 1) {
      connection.emit('echo', { uuid: `queued-${index}`, payload: {} });
    }
    expect(() => connection.emit('echo', { uuid: 'queue-overflow', payload: {} })).toThrow('outbox is full');
    connection.close();
  });
});
