/**
 * Browser-side engine contract, deliberately mirroring the server's provider contract
 * (`src/server/modules/prompt_enhancer/providers/base.py`, RFC-0026): one structural interface,
 * a normalized result, and an error hierarchy whose members each carry a stable public `code`.
 * Keeping the two shapes aligned means a failure means the same thing on both sides of the
 * product, and the compiled-spec schema stays the single contract they share.
 */

import type { CompiledSpec } from '../prompt';

/** Stable public identifiers, the browser analogue of `ProviderError.code`. The UI maps these to
 * distinct recovery messages — before this, every failure collapsed into one "unsupported" notice. */
export type EngineErrorCode =
  | 'engine_configuration'
  | 'engine_unsupported'
  | 'engine_download'
  | 'engine_auth'
  | 'engine_rate_limit'
  | 'engine_context_overflow'
  | 'engine_error';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EngineError';
    this.code = code;
  }
}

/**
 * Port of `base.redact_secret`. Scrubs a credential out of any diagnostic string before it can
 * reach an error message, the console, or the DOM. Every engine that holds a key routes its
 * error text through this — a thrown provider error frequently echoes the request that caused it.
 */
export function redactSecret(text: string, secret: string | null | undefined): string {
  if (!secret || secret.length < 8) return text;
  return text.split(secret).join('[redacted]');
}

export interface EngineInfo {
  /** `local` runs on this device; the rest reach a third-party API with the user's own key. */
  kind: 'local' | 'anthropic' | 'openai' | 'gemini';
  label: string;
  modelId: string;
  /** True only when no request leaves the browser — drives the privacy indicator in the UI. */
  onDevice: boolean;
}

export interface EngineProgress {
  status: string;
  file?: string;
  /** 0–100 when the engine can report determinate progress (model shard downloads). */
  progress?: number;
}

export interface CompileHandlers {
  /** Raw token text, for progressive parsing. Not called by engines that cannot stream. */
  onToken?: (token: string) => void;
  onProgress?: (event: EngineProgress) => void;
  signal?: AbortSignal;
}

export interface Engine {
  info(): EngineInfo;
  /** Resolves to the model's raw text. Callers parse it — engines never parse. */
  compile(prompt: string, handlers?: CompileHandlers): Promise<string>;
}

/**
 * JSON Schema for `CompiledSpec`, shared by every API engine so the 10-key envelope is
 * *guaranteed* by the provider rather than recovered by the tolerant parser. The local tier has
 * no constrained-decoding path and keeps relying on `parseCompiledSpec`, which stays the
 * universal fallback (RFC-0011 § grammar: structural validity by construction where available).
 */
export const SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'directive',
    'task',
    'context',
    'known_requirements',
    'inferred_requirements',
    'implementation_strategy',
    'constraints',
    'quality_expectations',
    'validation_checklist',
    'output_requirements',
  ],
  properties: {
    directive: { type: 'string' },
    task: { type: 'string' },
    context: { type: 'string' },
    known_requirements: { type: 'array', items: { type: 'string' } },
    inferred_requirements: { type: 'array', items: { type: 'string' } },
    implementation_strategy: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    quality_expectations: { type: 'array', items: { type: 'string' } },
    validation_checklist: { type: 'array', items: { type: 'string' } },
    output_requirements: { type: 'array', items: { type: 'string' } },
  },
} as const satisfies Record<string, unknown>;

/** Compile-time assertion that the schema's `required` list stays in step with `CompiledSpec`.
 * Adding a field to the interface without adding it here is a type error, not a runtime surprise. */
type SchemaCoversSpec = (typeof SPEC_JSON_SCHEMA)['required'][number] extends keyof CompiledSpec
  ? keyof CompiledSpec extends (typeof SPEC_JSON_SCHEMA)['required'][number]
    ? true
    : never
  : never;
export const _schemaCoversSpec: SchemaCoversSpec = true;

/** Hints that mark a context-window rejection, mirroring `_CONTEXT_HINTS` in the HTTP adapters:
 * status codes alone do not distinguish overflow from a generic bad request. */
const CONTEXT_HINTS = ['context', 'exceed', 'too large', 'too long', 'maximum tokens', 'max_tokens'];

/**
 * Maps an arbitrary thrown value to the taxonomy. HTTP status drives the common cases; the
 * message is only consulted to separate context overflow from other 4xx, exactly as the Python
 * adapters do. `secret` is redacted from whatever message we end up carrying.
 */
export function classifyApiError(error: unknown, secret?: string | null): EngineError {
  if (error instanceof EngineError) return error;

  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 0;
  const raw = error instanceof Error ? error.message : String(error);
  // Provider errors routinely echo the offending request; truncate as `provider HTTP` does (300).
  const detail = redactSecret(raw, secret).slice(0, 300);

  if (status === 401 || status === 403) {
    return new EngineError('engine_auth', 'The API key was rejected. Check the key and its permissions.', {
      cause: error,
    });
  }
  if (status === 429) {
    return new EngineError('engine_rate_limit', 'Rate limited by the provider. Wait a moment and retry.', {
      cause: error,
    });
  }
  if (status === 400 || status === 413 || status === 422) {
    const lowered = detail.toLowerCase();
    if (CONTEXT_HINTS.some((hint) => lowered.includes(hint))) {
      return new EngineError('engine_context_overflow', 'The request exceeded the model context window.', {
        cause: error,
      });
    }
  }
  return new EngineError('engine_error', detail || 'The provider request failed.', { cause: error });
}
