import { describe, expect, test } from 'bun:test';
import { parseBunLock, parsePythonLock } from './release';

describe('release dependency inventory', () => {
  test('parses and deduplicates Bun lock identities', () => {
    const source = `"pkg": ["pkg@1.2.3"]\n"nested/pkg": ["pkg@1.2.3"]\n"scope": ["@scope/name@4.5.6"]`;
    expect(parseBunLock(source)).toEqual([
      { ecosystem: 'npm', name: '@scope/name', version: '4.5.6', source: 'bun.lock' },
      { ecosystem: 'npm', name: 'pkg', version: '1.2.3', source: 'bun.lock' },
    ]);
  });

  test('parses hash-locked Python requirements', () => {
    expect(parsePythonLock('AnyIO==4.14.2 \\\n    --hash=sha256:value')).toEqual([
      { ecosystem: 'pypi', name: 'anyio', version: '4.14.2', source: 'requirements-dev.lock' },
    ]);
  });
});
