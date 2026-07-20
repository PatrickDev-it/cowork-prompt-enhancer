import type { $WSServer } from '@/lib/ws';

/** Descrittore di prompt riusato dal prompt bridge — RFC-0002 § 6. */
export interface PromptDescriptor {
  key: string;
  name: string;
  props: Record<string, unknown>;
  sub_prompts?: Record<string, PromptDescriptor[]>;
  /**
   * Se `true`, il runtime comprime in HEAD il valore risolto di questo prompt quando supera la
   * soglia token, PRIMA di passarlo a `tool.run` (RFC-0015). Il modulo resta ignaro: riceve il
   * condensato al posto del grezzo. Adatto agli input potenzialmente enormi (es. `file-select`).
   */
  compress?: boolean;
}

export type StatusSubEvent = 'start' | 'progress' | 'log' | 'done' | 'error';

export interface StatusUpdate {
  sub_event: StatusSubEvent;
  message?: string;
  /** Solo per sub_event: 'progress', 0-100. */
  percent?: number;
}

export type FileOp = 'write' | 'append' | 'mkdir' | 'delete' | 'move';

/** Richiesta di operazione su filesystem consegnata al client — RFC-0008 § 3. */
export interface FileOpRequest {
  op: FileOp;
  /** Percorso relativo dentro la cartella di sessione; il client lo confina lì. */
  path: string;
  /** Solo per 'write' e 'append'. */
  content?: string;
  /** Percorso relativo di destinazione, solo per 'move'. */
  to?: string;
}

/**
 * Operazioni sul filesystem del client pilotate granularmente dal server — RFC-0008 § 5.
 * Ogni percorso è relativo alla cartella di sessione ($ROOT/{session-uuid}/): è il client
 * a confinarlo lì (§ 6). Simmetrico a `status`: un tool compone il prodotto senza conoscere il protocollo.
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
  payload: Record<string, unknown>;
  status: (update: StatusUpdate) => void;
  fs: FileOps;
}

/** Un tool remoto — RFC-0003 § 1. Aggiungere un file in tools/ che esporta uno di questi basta a registrarlo. */
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
