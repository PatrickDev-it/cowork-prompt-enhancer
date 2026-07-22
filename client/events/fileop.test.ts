import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { confinePath } from './fileop';

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cowork-path-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical session path confinement', () => {
  test('accepts a normalized relative path under the session root', () => {
    const root = temporaryRoot();
    mkdirSync(join(root, 'notes'));
    writeFileSync(join(root, 'notes', 'todo.md'), 'x');
    expect(confinePath(root, 'notes/todo.md')).toBe(resolve(root, 'notes', 'todo.md'));
  });

  test('rejects absolute, traversal, mixed-separator, device and reserved paths', () => {
    const root = temporaryRoot();
    const rejected = [
      '',
      '../escape.txt',
      'notes/../../escape.txt',
      '/absolute.txt',
      'C:/absolute.txt',
      '\\\\server\\share\\file.txt',
      'notes\\..\\escape.txt',
      'CON',
      'aux.txt',
      'LPT9.log',
      'folder./file.txt',
    ];
    for (const candidate of rejected) expect(confinePath(root, candidate)).toBeNull();
  });

  test('rejects symlink or junction escape through an existing ancestor', () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();
    const link = join(root, 'link');
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(confinePath(root, 'link/escape.txt')).toBeNull();
  });
});
