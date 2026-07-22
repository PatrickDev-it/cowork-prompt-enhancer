import { createHmac, randomUUID } from 'node:crypto';
import {
  decodeServerEnvelope,
  DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  type ErrorEnvelope,
} from '../../protocol';

type Listener = (payload: Record<string, unknown>) => void;
export type ConnectionState = 'connecting' | 'ready' | 'degraded' | 'reconnecting' | 'closed';
const MAX_OUTBOX_FRAMES = 64;

interface SessionChallenge {
  id: string;
  nonce: string;
  expiresAt: number;
}

export interface WSOptions {
  authSecret?: string;
  clientId?: string;
  maxReconnectAttempts?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  random?: () => number;
}

export function reconnectDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const bounded = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(bounded * (0.8 + random() * 0.4));
}

function commandId(payload: Record<string, unknown>): string {
  const uuid = payload.uuid;
  return typeof uuid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uuid) ? uuid : randomUUID();
}

export class $WS {
  private ws: WebSocket | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  private readonly outbox: string[] = [];
  private explicitClose = false;
  private reconnectAttempts = 0;
  private _state: ConnectionState = 'connecting';
  private readyResolve!: () => void;
  private readyPromise = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });
  readonly clientId: string;

  constructor(
    private readonly url: string,
    private readonly role: string,
    private readonly options: WSOptions = {}
  ) {
    this.clientId = options.clientId ?? randomUUID();
    void this.connect(false);
  }

  get state(): ConnectionState {
    return this._state;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  onState(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: Record<string, unknown>): string {
    const id = commandId(payload);
    const normalizedPayload = { ...payload, uuid: id };
    const encoded = JSON.stringify({
      version: PROTOCOL_VERSION,
      kind: 'command',
      id,
      event,
      payload: normalizedPayload,
    });
    this.sendOrQueue(encoded);
    return id;
  }

  cancel(id: string): void {
    this.sendOrQueue(JSON.stringify({ version: PROTOCOL_VERSION, kind: 'cancel', id }));
  }

  close(): void {
    this.explicitClose = true;
    this.setState('closed');
    this.ws?.close(1000, 'client closed');
    this.ws = null;
  }

  private async connect(reconnecting: boolean): Promise<void> {
    if (this.explicitClose) return;
    this.setState(reconnecting ? 'reconnecting' : 'connecting');
    const baseUrl = new URL(this.url);
    baseUrl.searchParams.set('clientId', this.clientId);
    let socketUrl = baseUrl.toString();
    try {
      if (this.options.authSecret) socketUrl = await this.authenticatedUrl();
      const ws = new WebSocket(socketUrl, this.role);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('ready');
        this.readyResolve();
        for (const frame of this.outbox.splice(0)) ws.send(frame);
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
      ws.onerror = () => {
        if (this.ws === ws) this.setState('degraded');
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (!this.explicitClose) this.scheduleReconnect();
      };
    } catch {
      this.setState('degraded');
      this.scheduleReconnect();
    }
  }

  private async authenticatedUrl(): Promise<string> {
    const httpUrl = new URL(this.url);
    httpUrl.protocol = httpUrl.protocol === 'wss:' ? 'https:' : 'http:';
    httpUrl.pathname = '/auth/challenge';
    httpUrl.search = new URLSearchParams({ clientId: this.clientId }).toString();
    const response = await fetch(httpUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Challenge request failed with HTTP ${response.status}`);
    const challenge = (await response.json()) as SessionChallenge;
    const message = `${challenge.id}:${challenge.nonce}:${challenge.expiresAt}:${this.clientId}`;
    const proof = createHmac('sha256', this.options.authSecret!).update(message).digest('hex');
    const wsUrl = new URL(this.url);
    wsUrl.search = new URLSearchParams({ clientId: this.clientId, challenge: challenge.id, proof }).toString();
    return wsUrl.toString();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const maxAttempts = this.options.maxReconnectAttempts ?? 6;
    if (this.reconnectAttempts > maxAttempts) {
      this.setState('closed');
      return;
    }
    this.setState('reconnecting');
    const delay = reconnectDelay(
      this.reconnectAttempts,
      this.options.reconnectBaseMs ?? 250,
      this.options.reconnectMaxMs ?? 5_000,
      this.options.random ?? Math.random
    );
    setTimeout(() => void this.connect(true), delay);
  }

  private sendOrQueue(encoded: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encoded);
      return;
    }
    if (this.outbox.length >= MAX_OUTBOX_FRAMES) throw new Error('WebSocket outbox is full');
    this.outbox.push(encoded);
  }

  private handleMessage(data: unknown): void {
    const decoded = decodeServerEnvelope(data, DEFAULT_MAX_FRAME_BYTES, DEFAULT_MAX_PAYLOAD_BYTES);
    if (!decoded.ok) {
      console.error(JSON.stringify({ level: 'warn', event: 'invalid_server_frame', code: decoded.code }));
      return;
    }
    if (decoded.value.kind === 'error') {
      this.dispatchError(decoded.value);
      return;
    }
    for (const listener of this.listeners.get(decoded.value.event) ?? []) listener(decoded.value.payload);
  }

  private dispatchError(error: ErrorEnvelope): void {
    for (const listener of this.listeners.get('error') ?? []) listener(error as unknown as Record<string, unknown>);
    if (!this.listeners.has('error')) {
      console.error(
        JSON.stringify({ level: 'error', event: 'server_error', correlationId: error.id, code: error.code })
      );
    }
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
