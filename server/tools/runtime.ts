import type { $WSServer } from '@/lib/ws';
import { compressContext } from '@/modules/context_compressor';
import { createFileOps } from './fs';
import type { PromptDescriptor, StatusUpdate, Tool } from './types';

/**
 * Collects the names of a tool's `compress: true` fields — RECURSIVELY, including inside
 * `sub_prompts`. A field declared on a conditional branch (e.g. `project-select` under
 * `sub_prompts['read-project']` of dev-prompt-enhancer, RFC-0021) MUST be compressible just like a
 * top-level one: looking only at `tool.prompts` let huge nested raw input through (bug: 18k tokens
 * of code → prefill pushed the compiler past its 600s HTTP timeout → silent fallback to
 * field_loop). RFC-0015 applies at every level of the bridge.
 */
export function collectCompressFields(
  prompts: PromptDescriptor[] | undefined,
  acc: Set<string> = new Set()
): Set<string> {
  for (const p of prompts ?? []) {
    if (p.compress) acc.add(p.name);
    if (p.sub_prompts) {
      for (const nested of Object.values(p.sub_prompts)) collectCompressFields(nested, acc);
    }
  }
  return acc;
}

/**
 * Semantic-compression HEAD — RFC-0015. Before a tool runs, every input declared `compress: true`
 * in its prompts (at ANY level, including `sub_prompts`) is condensed if it exceeds the token
 * threshold. This is cross-cutting: every module benefits just by declaring it, with no change to
 * its own logic (it receives the condensed value).
 */
async function compressToolInputs(
  tool: Tool,
  payload: Record<string, unknown>,
  status: (update: StatusUpdate) => void
): Promise<Record<string, unknown>> {
  const fields = [...collectCompressFields(tool.prompts)];
  if (fields.length === 0) return payload;

  const out = { ...payload };
  for (const name of fields) {
    const value = out[name];
    if (typeof value !== 'string' || !value) continue;
    const result = await compressContext(value, (message) => status({ sub_event: 'log', message }));
    if (result.compressed) out[name] = result.text;
  }
  return out;
}

/**
 * Wires a Tool into the per-connection event protocol: compression HEAD (RFC-0015), runs
 * `tool.run`, translates any exception into `status: error`, and always closes with the loop-back
 * to the menu (RFC-0002 § 5, RFC-0003 § 5) — no tool can leave the session stuck.
 */
export function registerTool(WS: $WSServer, tool: Tool) {
  WS.on(tool.name, async (data: { uuid: string; payload?: Record<string, unknown> }) => {
    const { uuid, payload = {} } = data;
    const status = (update: StatusUpdate) => WS.emit('status', { uuid, payload: { tool: tool.name, ...update } });
    const fs = createFileOps(WS);

    try {
      const finalPayload = await compressToolInputs(tool, payload, status);
      await tool.run(WS, { uuid, payload: finalPayload, status, fs });
    } catch (err) {
      status({ sub_event: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      WS.emit('init', { uuid });
    }
  });
}
