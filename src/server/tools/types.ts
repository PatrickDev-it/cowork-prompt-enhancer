import type { $WSServer } from '@/lib/ws';
import type { RequestTrace } from '@/lib/metrics';

/** Data-driven prompt descriptor shared by the prompt bridge. */
export interface PromptDescriptor {
  key: string;
  name: string;
  props: Record<string, unknown>;
  sub_prompts?: Record<string, PromptDescriptor[]>;
  /**
   * Condense this value before tool execution when it exceeds the configured token threshold.
   */
  compress?: boolean;
}

export type StatusSubEvent = 'start' | 'progress' | 'log' | 'done' | 'error';

export interface StatusUpdate {
  sub_event: StatusSubEvent;
  message?: string;
  /** Defined only for progress events; range 0-100. */
  percent?: number;
  trace?: RequestTrace;
}

export type FileOp = 'write' | 'append' | 'mkdir' | 'delete' | 'move';

/** Filesystem operation request delivered to the capability-aware client. */
export interface FileOpRequest {
  op: FileOp;
  /** Relative path confined by the client beneath its session directory. */
  path: string;
  /** Defined only for write and append. */
  content?: string;
  /** Relative destination defined only for move. */
  to?: string;
}

/**
 * Capability-aware filesystem operations. Every path is relative to the client-confined session root.
 */
export interface FileOps {
  write(path: string, content: string): void;
  append(path: string, content: string): void;
  mkdir(path: string): void;
  delete(path: string): void;
  move(from: string, to: string): void;
}

export interface ToolContext {
  uuid: string;
  correlationId: string;
  clientId: string;
  sessionId: string;
  payload: Record<string, unknown>;
  status: (update: StatusUpdate) => void;
  fs: FileOps;
  signal: AbortSignal;
  trace: RequestTrace;
}

/** Auto-discovered remote tool contract. */
export interface Tool {
  name: string;
  description: string;
  prompts?: PromptDescriptor[];
  run: (WS: $WSServer, ctx: ToolContext) => Promise<void>;
}

export function isTool(value: unknown): value is Tool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Tool).name === 'string' &&
    typeof (value as Tool).description === 'string' &&
    typeof (value as Tool).run === 'function'
  );
}
