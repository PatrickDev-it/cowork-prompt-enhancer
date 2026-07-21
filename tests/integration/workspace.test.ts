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
});
