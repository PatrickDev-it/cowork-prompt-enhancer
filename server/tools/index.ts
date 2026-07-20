import { readdirSync } from 'node:fs';
import { isTool, type Tool } from './types';

const EXCLUDED = new Set(['index.ts', 'types.ts', 'runtime.ts', 'fs.ts', 'enhance-run.ts']);

/** Pure filter over a directory listing — split out of `discoverTools` so it's testable without disk I/O. */
export function filterToolFiles(files: string[]): string[] {
  return files.filter((f) => f.endsWith('.ts') && !EXCLUDED.has(f));
}

/** Pure aggregation of every `Tool`-shaped export across a set of module namespaces. */
export function collectTools(modules: Record<string, unknown>[]): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const mod of modules) {
    for (const exported of Object.values(mod)) {
      if (isTool(exported)) tools[exported.name] = exported;
    }
  }
  return tools;
}

async function discoverTools(): Promise<Record<string, Tool>> {
  const files = filterToolFiles(readdirSync(import.meta.dir));
  const modules = await Promise.all(files.map((f) => import(`./${f}`)));
  return collectTools(modules);
}

/**
 * Registro di tool auto-scoperto — RFC-0003 § 2. Un nuovo file in tools/ che esporta
 * un `Tool` valido appare qui automaticamente, senza altre modifiche.
 */
export const tools: Record<string, Tool> = await discoverTools();
