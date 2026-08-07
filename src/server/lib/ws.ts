import type { ServerWebSocket } from 'bun';
import { MAX_FRAME_BYTES, MAX_PAYLOAD_BYTES } from '@/config';
import { decodeClientEnvelope, errorEnvelope, eventEnvelope, type ErrorCode } from '../../protocol';
import { CommandReplayCache } from './replay';

export interface SocketData {
  role: string | null;
  uuid: string;
  clientId: string;
}

export interface MessageContext {
  id: string;
  event: string;
  clientId: string;
  sessionId: string;
}

type Listener = (payload: Record<string, unknown>, context: MessageContext) => void;
type CancelListener = (id: string) => void;

const replayCache = new CommandReplayCache();
const REPLAY_EXEMPT_EVENTS = new Set(['init', 'fileops', 'fileop-result']);
const BACKPRESSURE_BYTES = 256 * 1024;

function correlationId(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) return fallback;
  const uuid = (payload as { uuid?: unknown }).uuid;
  return typeof uuid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uuid) ? uuid : fallback;
}

function terminalStatus(payload: Record<string, unknown>): boolean {
  const nested = payload.payload;
  if (typeof nested !== 'object' || nested === null) return false;
  const subEvent = (nested as { sub_event?: unknown }).sub_event;
  return subEvent === 'done' || subEvent === 'error';
}

export class $WSServer {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly cancelListeners = new Set<CancelListener>();
  private readonly coalesced = new Map<string, { event: string; payload: Record<string, unknown> }>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(public readonly ws: ServerWebSocket<SocketData>) {}

  get sessionId(): string {
    return this.ws.data.uuid;
  }

  get clientId(): string {
    return this.ws.data.clientId;
  }

  handleMessage(data: string | Buffer): void {
    const decoded = decodeClientEnvelope(data, MAX_FRAME_BYTES, MAX_PAYLOAD_BYTES);
    if (!decoded.ok) {
      this.sendError(decoded.id ?? this.sessionId, decoded.code, decoded.message);
      this.log('warn', decoded.id ?? this.sessionId, 'invalid_frame', decoded.code);
      return;
    }
    if (decoded.value.kind === 'cancel') {
      for (const listener of this.cancelListeners) listener(decoded.value.id);
      return;
    }
    const command = decoded.value;
    if (!REPLAY_EXEMPT_EVENTS.has(command.event) && !replayCache.accept(this.clientId, command.id)) {
      this.sendError(command.id, 'duplicate_command', 'Command was already accepted', false);
      return;
    }
    const context = {
      id: command.id,
      event: command.event,
      clientId: this.clientId,
      sessionId: this.sessionId,
    };
    for (const listener of this.listeners.get(command.event) ?? []) listener(command.payload, context);
  }

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  onCancel(listener: CancelListener): () => void {
    this.cancelListeners.add(listener);
    return () => this.cancelListeners.delete(listener);
  }

  emit(event: string, payload: Record<string, unknown>): void {
    const id = correlationId(payload, this.sessionId);
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_PAYLOAD_BYTES) {
      this.sendError(id, 'payload_too_large', 'Outbound payload exceeded configured limit');
      return;
    }
    if (event === 'status' && !terminalStatus(payload) && this.ws.getBufferedAmount() > BACKPRESSURE_BYTES) {
      this.coalesced.set(id, { event, payload });
      this.scheduleFlush();
      return;
    }
    this.send(eventEnvelope(id, event, payload));
  }

  sendError(id: string, code: ErrorCode, message: string, retryable = false): void {
    this.send(errorEnvelope(id, code, message, retryable));
  }

  send(payload: unknown): void {
    const encoded = JSON.stringify(payload);
    if (new TextEncoder().encode(encoded).byteLength > MAX_FRAME_BYTES) {
      const id = correlationId(payload, this.sessionId);
      this.ws.send(JSON.stringify(errorEnvelope(id, 'frame_too_large', 'Outbound frame exceeded configured limit')));
      return;
    }
    this.ws.send(encoded);
  }

  close(code = 1000, reason = 'closed'): void {
    this.ws.close(code, reason);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.ws.getBufferedAmount() > BACKPRESSURE_BYTES) {
        this.scheduleFlush();
        return;
      }
      const pending = [...this.coalesced.values()];
      this.coalesced.clear();
      for (const item of pending) this.emit(item.event, item.payload);
    }, 25);
  }

  private log(level: 'warn' | 'info', correlation: string, event: string, detail: string): void {
    const entry = {
      level,
      event,
      clientId: this.clientId,
      sessionId: this.sessionId,
      correlationId: correlation,
      detail,
    };
    console.error(JSON.stringify(entry));
  }
}

const registry = new WeakMap<ServerWebSocket<SocketData>, $WSServer>();

export function $WSWrapper(handlers: { open: (WS: $WSServer) => void; close?: (WS: $WSServer) => void }) {
  return {
    open(ws: ServerWebSocket<SocketData>): void {
      const WS = new $WSServer(ws);
      registry.set(ws, WS);
      handlers.open(WS);
    },
    message(ws: ServerWebSocket<SocketData>, data: string | Buffer): void {
      registry.get(ws)?.handleMessage(data);
    },
    close(ws: ServerWebSocket<SocketData>): void {
      const WS = registry.get(ws);
      if (WS) handlers.close?.(WS);
      registry.delete(ws);
    },
  };
}
