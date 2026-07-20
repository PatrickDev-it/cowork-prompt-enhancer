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
 * Wrapper minimale, in stile EventEmitter, sopra il WebSocket nativo.
 * Espone la stessa API di server/lib/ws.ts — vedi RFC-0002 § 2.
 */
export class $WS {
  private ws: WebSocket;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string, role: string) {
    this.ws = new WebSocket(url, role);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => this.handleMessage(e.data);
  }

  private handleMessage(data: unknown) {
    if (data instanceof ArrayBuffer) return; // trasferimento file, non ancora implementato
    // Confine di sistema: frame dalla rete, non fidato. Un JSON malformato o di forma
    // inattesa va ignorato (loggato), mai propagato — vedi server/lib/ws.ts.
    let parsed: unknown;
    try {
      parsed = JSON.parse(data as string);
    } catch {
      console.error(`Frame non-JSON ignorato: ${String(data).slice(0, 120)}`);
      return;
    }
    if (!isEventFrame(parsed)) {
      console.error('Frame di forma non valida ignorato:', parsed);
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
