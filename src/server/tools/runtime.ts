import type { $WSServer } from '@/lib/ws';
import { createRequestTrace, requestMetrics, type RequestTrace } from '@/lib/metrics';
import { BoundedScheduler, SchedulerError } from '@/lib/scheduler';
import { compressContext } from '@/modules/context_compressor';
import { COMMAND_TIMEOUT_MS, MAX_ACTIVE_COMMANDS, MAX_QUEUED_COMMANDS, MAX_SESSION_COMMANDS } from '@/config';
import type { ErrorCode } from '../../protocol';
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
  status: (update: StatusUpdate) => void,
  signal: AbortSignal,
  trace: RequestTrace
): Promise<Record<string, unknown>> {
  const startedAt = performance.now();
  const fields = [...collectCompressFields(tool.prompts)];
  if (fields.length === 0) {
    trace.compressionMs = performance.now() - startedAt;
    return payload;
  }

  const out = { ...payload };
  for (const name of fields) {
    const value = out[name];
    if (typeof value !== 'string' || !value) continue;
    const result = await compressContext(value, (message) => status({ sub_event: 'log', message }), signal);
    trace.compressionInputTokens += result.inputTokens;
    trace.compressionOutputTokens += result.outputTokens;
    if (result.compressed) {
      out[name] = result.text;
      trace.compressedFields += 1;
    }
  }
  trace.compressionMs = performance.now() - startedAt;
  return out;
}

/**
 * Wires a Tool into the per-connection event protocol: compression HEAD (RFC-0015), runs
 * `tool.run`, translates any exception into `status: error`, and always closes with the loop-back
 * to the menu (RFC-0002 § 5, RFC-0003 § 5) — no tool can leave the session stuck.
 */
export const commandScheduler = new BoundedScheduler({
  maxActive: MAX_ACTIVE_COMMANDS,
  maxPerSession: MAX_SESSION_COMMANDS,
  maxQueued: MAX_QUEUED_COMMANDS,
  timeoutMs: COMMAND_TIMEOUT_MS,
});

function publicErrorCode(error: unknown): ErrorCode {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'internal_error';
  const code = error.code;
  if (code === 'capability_mismatch' || code === 'provider_error' || code === 'timeout') return code;
  return 'internal_error';
}

export function bindScheduler(WS: $WSServer): void {
  WS.onCancel((id) => commandScheduler.cancel(WS.sessionId, id));
}

export function cancelSessionCommands(WS: $WSServer): void {
  commandScheduler.cancelSession(WS.sessionId);
}

export function registerTool(WS: $WSServer, tool: Tool): void {
  WS.on(tool.name, (data, message) => {
    const rawPayload = data.payload;
    const payload =
      typeof rawPayload === 'object' && rawPayload !== null ? (rawPayload as Record<string, unknown>) : {};
    const uuid = message.id;
    const status = (update: StatusUpdate) => WS.emit('status', { uuid, payload: { tool: tool.name, ...update } });
    const fs = createFileOps(WS, uuid);
    const trace = createRequestTrace();
    const startedAt = performance.now();
    let outcome: 'success' | 'error' = 'success';

    void commandScheduler
      .schedule(WS.sessionId, uuid, async (signal) => {
        trace.schedulerQueueMs = performance.now() - startedAt;
        try {
          const finalPayload = await compressToolInputs(tool, payload, status, signal, trace);
          await tool.run(WS, {
            uuid,
            correlationId: uuid,
            clientId: message.clientId,
            sessionId: message.sessionId,
            payload: finalPayload,
            status,
            fs,
            signal,
            trace,
          });
          if (signal.aborted) throw signal.reason;
        } catch (error) {
          outcome = 'error';
          if (signal.aborted) throw signal.reason;
          const messageText = error instanceof Error ? error.message : String(error);
          const code = publicErrorCode(error);
          status({ sub_event: 'error', message: messageText });
          WS.sendError(uuid, code, messageText);
        }
      })
      .catch((error: unknown) => {
        outcome = 'error';
        const schedulerError = error instanceof SchedulerError ? error : null;
        const code = schedulerError?.code ?? 'internal_error';
        const messageText = error instanceof Error ? error.message : String(error);
        status({ sub_event: 'error', message: messageText });
        WS.sendError(uuid, code, messageText, code === 'overloaded');
      })
      .finally(() => {
        trace.totalMs = performance.now() - startedAt;
        requestMetrics.record({ correlationId: uuid, tool: tool.name, outcome, trace });
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'request_trace',
            correlationId: uuid,
            tool: tool.name,
            outcome,
            trace,
          })
        );
        WS.emit('init', { uuid });
      });
  });
}
