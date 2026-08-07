import { describe, expect, test } from 'bun:test';
import { decodeClientEnvelope, decodeServerEnvelope, errorEnvelope, eventEnvelope, PROTOCOL_VERSION } from '.';

const payload = { uuid: 'command-1', payload: { request: 'build it' } };

describe('protocol v1 schemas', () => {
  test('accepts discriminated commands and cancellation', () => {
    const command = JSON.stringify({
      version: PROTOCOL_VERSION,
      kind: 'command',
      id: 'command-1',
      event: 'echo',
      payload,
    });
    expect(decodeClientEnvelope(command)).toEqual({
      ok: true,
      value: { version: 1, kind: 'command', id: 'command-1', event: 'echo', payload },
    });
    expect(decodeClientEnvelope(JSON.stringify({ version: 1, kind: 'cancel', id: 'command-1' }))).toEqual({
      ok: true,
      value: { version: 1, kind: 'cancel', id: 'command-1' },
    });
  });

  test('rejects legacy, malformed, binary and oversized frames before dispatch', () => {
    expect(decodeClientEnvelope(JSON.stringify({ event: 'echo', props: [] })).ok).toBeFalse();
    expect(decodeClientEnvelope('{').ok).toBeFalse();
    expect(decodeClientEnvelope(new Uint8Array()).ok).toBeFalse();
    expect(decodeClientEnvelope('x'.repeat(65), 64).ok).toBeFalse();
    expect(
      decodeClientEnvelope(
        JSON.stringify({ version: 1, kind: 'command', id: 'one', event: 'echo', payload: { uuid: 'two', payload: {} } })
      ).ok
    ).toBeFalse();
  });

  test('enforces the decoded payload bound', () => {
    const encoded = JSON.stringify({
      version: 1,
      kind: 'command',
      id: 'command-1',
      event: 'echo',
      payload: { uuid: 'command-1', payload: { content: 'x'.repeat(128) } },
    });
    const result = decodeClientEnvelope(encoded, 2048, 64);
    expect(result).toMatchObject({ ok: false, code: 'payload_too_large' });
  });

  test('round-trips server event and stable error envelopes', () => {
    expect(decodeServerEnvelope(JSON.stringify(eventEnvelope('command-1', 'status', payload)))).toMatchObject({
      ok: true,
    });
    expect(decodeServerEnvelope(JSON.stringify(errorEnvelope('command-1', 'overloaded', 'Queue full', true)))).toEqual({
      ok: true,
      value: {
        version: 1,
        kind: 'error',
        id: 'command-1',
        code: 'overloaded',
        message: 'Queue full',
        retryable: true,
      },
    });
  });
});
