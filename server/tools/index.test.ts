import { describe, expect, test } from 'bun:test';
import { collectTools, filterToolFiles } from './index';
import type { Tool } from './types';

describe('filterToolFiles', () => {
  test('skips every file in EXCLUDED and anything that is not a .ts file', () => {
    const files = [
      'index.ts',
      'types.ts',
      'runtime.ts',
      'fs.ts',
      'enhance-run.ts',
      'runtime.test.ts',
      'echo.ts',
      'README.md',
    ];
    expect(filterToolFiles(files)).toEqual(['echo.ts']);
  });

  test('keeps every non-excluded .ts file', () => {
    expect(filterToolFiles(['echo.ts', 'system-info.ts'])).toEqual(['echo.ts', 'system-info.ts']);
  });
});

describe('collectTools', () => {
  test('registers a fixture Tool export, keyed by its declared name', () => {
    const fixtureTool: Tool = {
      name: 'fixture-tool',
      description: 'a fixture tool used only by this test',
      run: async () => {},
    };
    const modules = [{ fixtureTool, notATool: { foo: 'bar' } }];
    expect(collectTools(modules)).toEqual({ 'fixture-tool': fixtureTool });
  });

  test('ignores exports that are not Tool-shaped', () => {
    const modules = [{ SOME_CONST: 42, helper: () => {} }];
    expect(collectTools(modules)).toEqual({});
  });

  test('merges Tool exports across multiple module namespaces', () => {
    const toolA: Tool = { name: 'a', description: 'a', run: async () => {} };
    const toolB: Tool = { name: 'b', description: 'b', run: async () => {} };
    expect(collectTools([{ toolA }, { toolB }])).toEqual({ a: toolA, b: toolB });
  });
});
