import { describe, expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { $WSServer, type SocketData } from './ws';

function connection(clientId: string, sessionId: string) {
  const sent: string[] = [];
  const native = {
    data: { clientId, uuid: sessionId, role: 'client' },
    send: (frame: string) => {
      sent.push(frame);
      return frame.length;
    },
    close: () => undefined,
    getBufferedAmount: () => 0,
  } as unknown as ServerWebSocket<SocketData>;
  return { WS: new $WSServer(native), sent };
}

function command(id: string, event = 'echo'): string {
  return JSON.stringify({ version: 1, kind: 'command', id, event, payload: { uuid: id, payload: {} } });
}

describe('server WebSocket protocol boundary', () => {
  test('invalid frames never reach event handlers and return stable errors', () => {
    const { WS, sent } = connection('client-invalid', 'session-invalid');
    let calls = 0;
    WS.on('echo', () => {
      calls += 1;
    });
    WS.handleMessage(JSON.stringify({ event: 'echo', props: [] }));
    WS.handleMessage('{');
    expect(calls).toBe(0);
    expect(sent.map((frame) => JSON.parse(frame).code)).toEqual(['invalid_frame', 'invalid_frame']);
  });

  test('dispatches validated commands with structured correlation context', () => {
    const { WS } = connection('client-valid', 'session-valid');
    let correlation = '';
    WS.on('echo', (_payload, context) => {
      correlation = context.id;
    });
    WS.handleMessage(command('command-valid'));
    expect(correlation).toBe('command-valid');
  });

  test('rejects duplicate execution across a reconnect with the same client ID', () => {
    const first = connection('stable-client', 'session-one');
    const second = connection('stable-client', 'session-two');
    let calls = 0;
    first.WS.on('echo', () => {
      calls += 1;
    });
    second.WS.on('echo', () => {
      calls += 1;
    });
    first.WS.handleMessage(command('stable-command'));
    second.WS.handleMessage(command('stable-command'));
    expect(calls).toBe(1);
    expect(JSON.parse(second.sent[0]!).code).toBe('duplicate_command');
  });

  test('routes cancellation without dispatching a command', () => {
    const { WS } = connection('client-cancel', 'session-cancel');
    let cancelled = '';
    WS.onCancel((id) => {
      cancelled = id;
    });
    WS.handleMessage(JSON.stringify({ version: 1, kind: 'cancel', id: 'command-cancel' }));
    expect(cancelled).toBe('command-cancel');
  });
});
