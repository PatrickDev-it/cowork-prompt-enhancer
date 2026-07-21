import { describe, expect, test } from 'bun:test';

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
      'audit',
      'demo:mock',
      'benchmark',
    ];

    for (const command of required) expect(manifest.scripts[command]).toBeString();
  });

  test('references the public Bun type package from clean workspace installs', async () => {
    for (const workspace of ['client', 'server']) {
      const config = await Bun.file(new URL(`../../${workspace}/tsconfig.json`, import.meta.url)).json();
      expect(config.compilerOptions.types).toEqual(['bun']);
    }
  });
});
