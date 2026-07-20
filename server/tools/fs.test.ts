import { describe, expect, test } from 'bun:test';
import type { $WSServer } from '@/lib/ws';
import { createFileOps, rememberAdvertisedOps } from './fs';

function fakeConnection(sessionId: string) {
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const WS = {
    sessionId,
    emit: (event: string, ...args: unknown[]) => emitted.push({ event, args }),
  } as unknown as $WSServer;
  return { WS, emitted };
}

describe('createFileOps', () => {
  test('throws when the op is not in the connection-advertised set', () => {
    const { WS } = fakeConnection('session-1');
    rememberAdvertisedOps(WS, ['write']);
    const fs = createFileOps(WS);
    expect(() => fs.delete('secrets.txt')).toThrow();
  });

  test('never emits when the op is rejected', () => {
    const { WS, emitted } = fakeConnection('session-1');
    rememberAdvertisedOps(WS, ['write']);
    const fs = createFileOps(WS);
    expect(() => fs.mkdir('some/dir')).toThrow();
    expect(emitted).toEqual([]);
  });

  test('emits the correct fileop payload when the op is advertised', () => {
    const { WS, emitted } = fakeConnection('session-42');
    rememberAdvertisedOps(WS, ['write', 'move']);

    const fs = createFileOps(WS);
    fs.write('notes/todo.md', '- ship it');

    expect(emitted).toEqual([
      {
        event: 'fileop',
        args: [{ uuid: 'session-42', payload: { op: 'write', path: 'notes/todo.md', content: '- ship it' } }],
      },
    ]);
  });

  test('emits a move payload with both from/to paths', () => {
    const { WS, emitted } = fakeConnection('session-42');
    rememberAdvertisedOps(WS, ['move']);

    const fs = createFileOps(WS);
    fs.move('old.md', 'new.md');

    expect(emitted).toEqual([
      { event: 'fileop', args: [{ uuid: 'session-42', payload: { op: 'move', path: 'old.md', to: 'new.md' } }] },
    ]);
  });

  test('an unadvertised connection (rememberAdvertisedOps never called) rejects every op', () => {
    const { WS } = fakeConnection('session-99');
    const fs = createFileOps(WS);
    expect(() => fs.write('a.txt', 'x')).toThrow();
  });
});
