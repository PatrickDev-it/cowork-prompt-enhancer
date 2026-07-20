import type { ServerWebSocket } from 'bun';

export interface SocketData {
  role: string | null;
  uuid: string;
}

type Listener = (...args: any[]) => void;

function isEventFrame(value: unknown): value is { event: string; props: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { event?: unknown }).event === 'string' &&
    Array.isArray((value as { props?: unknown }).props)
  );
}

/**
 * Wrapper minimale, in stile EventEmitter, sopra il ServerWebSocket nativo di Bun.
 * Espone la stessa API di client/lib/ws.ts — vedi RFC-0002 § 2.
 */
export class $WSServer {
  private listeners = new Map<string, Set<Listener>>();

  constructor(public readonly ws: ServerWebSocket<SocketData>) {}

  get sessionId() {
    return this.ws.data.uuid;
  }

  handleMessage(data: string | Buffer) {
    if (typeof data !== 'string') return; // frame binario: trasferimento file, non ancora implementato
    // Confine di sistema: il frame arriva dalla rete, non è fidato. Un JSON malformato o di
    // forma inattesa va ignorato (loggato), mai lasciato propagare — altrimenti l'eccezione
    // esce dal callback message di Bun e abbatte l'intero processo server per tutti i client.
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.error(`[${this.sessionId}] frame non-JSON ignorato: ${data.slice(0, 120)}`);
      return;
    }
    if (!isEventFrame(parsed)) {
      console.error(`[${this.sessionId}] frame di forma non valida ignorato:`, parsed);
      return;
    }
    this.dispatch(parsed.event, ...parsed.props);
  }

  private dispatch(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }

  on(event: string, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.off(event, cb);
  }

  off(event: string, cb: Listener) {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: unknown[]) {
    this.send({ event, props: args });
  }

  send(payload: unknown) {
    if (payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
      this.ws.send(payload);
    } else {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close() {
    this.ws.close();
  }
}

const registry = new WeakMap<ServerWebSocket<SocketData>, $WSServer>();

/**
 * Adatta i tre handler nativi di Bun.serve({ websocket }) al ciclo di vita di $WSServer,
 * garantendo un'unica istanza per connessione (RFC-0002 § 2).
 */
export function $WSWrapper(handlers: { open: (WS: $WSServer) => void; close?: (WS: $WSServer) => void }) {
  return {
    open(ws: ServerWebSocket<SocketData>) {
      const WS = new $WSServer(ws);
      registry.set(ws, WS);
      handlers.open(WS);
    },
    message(ws: ServerWebSocket<SocketData>, data: string | Buffer) {
      registry.get(ws)?.handleMessage(data);
    },
    close(ws: ServerWebSocket<SocketData>) {
      const WS = registry.get(ws);
      if (WS) handlers.close?.(WS);
      registry.delete(ws);
    },
  };
}
