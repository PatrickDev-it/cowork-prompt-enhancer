export const PROTOCOL_VERSION = 1 as const;
export const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
export const DEFAULT_MAX_PAYLOAD_BYTES = 512 * 1024;

export const ERROR_CODES = [
  'invalid_frame',
  'frame_too_large',
  'payload_too_large',
  'authentication_required',
  'authentication_failed',
  'challenge_expired',
  'challenge_replayed',
  'duplicate_command',
  'capability_mismatch',
  'overloaded',
  'timeout',
  'cancelled',
  'path_rejected',
  'provider_error',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CommandEnvelope {
  version: typeof PROTOCOL_VERSION;
  kind: 'command';
  id: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface CancelEnvelope {
  version: typeof PROTOCOL_VERSION;
  kind: 'cancel';
  id: string;
}

export interface EventEnvelope {
  version: typeof PROTOCOL_VERSION;
  kind: 'event';
  id: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface ErrorEnvelope {
  version: typeof PROTOCOL_VERSION;
  kind: 'error';
  id: string;
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export type ClientEnvelope = CommandEnvelope | CancelEnvelope;
export type ServerEnvelope = EventEnvelope | ErrorEnvelope;

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string; id?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isEvent(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validCommandPayload(value: Record<string, unknown>, id: string): boolean {
  return value.uuid === id && (value.payload === undefined || isRecord(value.payload));
}

function validEventPayload(value: Record<string, unknown>, id: string): boolean {
  return value.uuid === id;
}

export function decodeClientEnvelope(
  data: unknown,
  maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES
): DecodeResult<ClientEnvelope> {
  if (typeof data !== 'string') return { ok: false, code: 'invalid_frame', message: 'Binary frames are unsupported' };
  if (byteLength(data) > maxFrameBytes) {
    return { ok: false, code: 'frame_too_large', message: `Frame exceeds ${maxFrameBytes} bytes` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { ok: false, code: 'invalid_frame', message: 'Frame is not valid JSON' };
  }
  const candidateId = isRecord(parsed) && isId(parsed.id) ? parsed.id : undefined;
  if (!isRecord(parsed) || parsed.version !== PROTOCOL_VERSION || !isId(parsed.id)) {
    return { ok: false, code: 'invalid_frame', message: 'Unsupported or malformed protocol envelope', id: candidateId };
  }
  if (parsed.kind === 'cancel') {
    return { ok: true, value: { version: PROTOCOL_VERSION, kind: 'cancel', id: parsed.id } };
  }
  if (parsed.kind !== 'command' || !isEvent(parsed.event) || !isRecord(parsed.payload)) {
    return { ok: false, code: 'invalid_frame', message: 'Malformed command envelope', id: parsed.id };
  }
  if (!validCommandPayload(parsed.payload, parsed.id)) {
    return { ok: false, code: 'invalid_frame', message: 'Malformed command payload', id: parsed.id };
  }
  if (byteLength(JSON.stringify(parsed.payload)) > maxPayloadBytes) {
    return { ok: false, code: 'payload_too_large', message: `Payload exceeds ${maxPayloadBytes} bytes`, id: parsed.id };
  }
  return {
    ok: true,
    value: { version: PROTOCOL_VERSION, kind: 'command', id: parsed.id, event: parsed.event, payload: parsed.payload },
  };
}

export function decodeServerEnvelope(
  data: unknown,
  maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES
): DecodeResult<ServerEnvelope> {
  if (typeof data !== 'string') return { ok: false, code: 'invalid_frame', message: 'Binary frames are unsupported' };
  if (byteLength(data) > maxFrameBytes) {
    return { ok: false, code: 'frame_too_large', message: `Frame exceeds ${maxFrameBytes} bytes` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { ok: false, code: 'invalid_frame', message: 'Frame is not valid JSON' };
  }
  const candidateId = isRecord(parsed) && isId(parsed.id) ? parsed.id : undefined;
  if (!isRecord(parsed) || parsed.version !== PROTOCOL_VERSION || !isId(parsed.id)) {
    return { ok: false, code: 'invalid_frame', message: 'Unsupported or malformed protocol envelope', id: candidateId };
  }
  if (parsed.kind === 'error') {
    if (
      !ERROR_CODES.includes(parsed.code as ErrorCode) ||
      typeof parsed.message !== 'string' ||
      typeof parsed.retryable !== 'boolean'
    ) {
      return { ok: false, code: 'invalid_frame', message: 'Malformed error envelope', id: parsed.id };
    }
    return {
      ok: true,
      value: {
        version: PROTOCOL_VERSION,
        kind: 'error',
        id: parsed.id,
        code: parsed.code as ErrorCode,
        message: parsed.message,
        retryable: parsed.retryable,
      },
    };
  }
  if (parsed.kind !== 'event' || !isEvent(parsed.event) || !isRecord(parsed.payload)) {
    return { ok: false, code: 'invalid_frame', message: 'Malformed event envelope', id: parsed.id };
  }
  if (!validEventPayload(parsed.payload, parsed.id)) {
    return { ok: false, code: 'invalid_frame', message: 'Malformed event payload', id: parsed.id };
  }
  if (byteLength(JSON.stringify(parsed.payload)) > maxPayloadBytes) {
    return { ok: false, code: 'payload_too_large', message: `Payload exceeds ${maxPayloadBytes} bytes`, id: parsed.id };
  }
  return {
    ok: true,
    value: { version: PROTOCOL_VERSION, kind: 'event', id: parsed.id, event: parsed.event, payload: parsed.payload },
  };
}

export function eventEnvelope(id: string, event: string, payload: Record<string, unknown>): EventEnvelope {
  return { version: PROTOCOL_VERSION, kind: 'event', id, event, payload };
}

export function errorEnvelope(id: string, code: ErrorCode, message: string, retryable = false): ErrorEnvelope {
  return { version: PROTOCOL_VERSION, kind: 'error', id, code, message, retryable };
}
