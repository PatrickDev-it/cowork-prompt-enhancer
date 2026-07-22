import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

describe('offline reviewer path', () => {
  test('compiles a request and writes a confined artifact', () => {
    const root = join(import.meta.dir, '..', '..');
    const result = Bun.spawnSync(['bun', 'run', 'demo:mock', 'Build a typed task API'], {
      cwd: root,
      env: { ...process.env, COWORK_PROFILE: 'mock' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('deterministic offline demo');
    expect(stdout).toContain('# Known Requirements');
    expect(Bun.file(join(root, 'demo-output', 'prompt.md')).size).toBeGreaterThan(100);
  });
});
