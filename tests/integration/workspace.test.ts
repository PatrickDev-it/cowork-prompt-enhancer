import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

describe('root workspace contract', () => {
  test('exposes every required command from one package', async () => {
    const manifest = await Bun.file(new URL('../../package.json', import.meta.url)).json();
    const required = [
      'install:frozen',
      'format',
      'lint',
      'typecheck',
      'test:unit',
      'test:integration',
      'test:providers',
      'test:protocol',
      'test:supervisor',
      'test:e2e',
      'audit',
      'demo:mock',
      'benchmark',
    ];

    for (const command of required) expect(manifest.scripts[command]).toBeString();
  });

  test('references the public Bun type package from clean workspace installs', async () => {
    for (const workspace of ['src/client', 'src/server']) {
      const config = await Bun.file(new URL(`../../${workspace}/tsconfig.json`, import.meta.url)).json();
      expect(config.compilerOptions.types).toEqual(['bun']);
    }
  });

  test('audits the complete hash-locked Python inventory without a temporary resolver', async () => {
    const manifest = await Bun.file(new URL('../../package.json', import.meta.url)).json();
    expect(manifest.scripts.audit).toContain(
      'python -m pip_audit --disable-pip -r src/server/modules/requirements-dev.lock'
    );
  });

  test('forces portable LF checkouts for formatter reproducibility', () => {
    const result = Bun.spawnSync(
      ['git', 'check-attr', 'eol', '--', 'package.json', 'README.md', 'src/server/config.ts'],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        stdout: 'pipe',
      }
    );
    expect(result.exitCode).toBe(0);
    const output = new TextDecoder().decode(result.stdout);
    expect(output.match(/: eol: lf/g)).toHaveLength(3);
  });
});
