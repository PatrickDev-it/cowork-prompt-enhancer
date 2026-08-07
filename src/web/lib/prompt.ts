/**
 * Simplified compiler prompt for the browser tier. Same output schema and section order as the
 * server-side compiler (`src/server/modules/prompt_enhancer/prompts.py` — COMPILER_PROMPT,
 * INTENT_SPEC_FIELDS, COMPILER_SECTIONS), so output stays structurally consistent with the
 * desktop/terminal product. The instruction body is deliberately shorter: COMPILER_PROMPT was
 * tuned for an 8B model; a 1.7B/360M browser model has materially weaker instruction-following,
 * so this trades some of that policy nuance for a single concrete few-shot example instead.
 */

export interface CompiledSpec {
  directive: string;
  task: string;
  context: string;
  known_requirements: string[];
  inferred_requirements: string[];
  implementation_strategy: string[];
  constraints: string[];
  quality_expectations: string[];
  validation_checklist: string[];
  output_requirements: string[];
}

const SPEC_KEYS = [
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
] as const;

const LIST_FIELDS = new Set<string>([
  'known_requirements',
  'inferred_requirements',
  'implementation_strategy',
  'constraints',
  'quality_expectations',
  'validation_checklist',
  'output_requirements',
]);

/** Rendering order, mirroring `COMPILER_SECTIONS` on the server: empty sections are skipped, no
 * dangling headers. `directive` renders before the sections, not as one of its own (RFC-0019). */
export const COMPILER_SECTIONS: Array<{ header: string; field: keyof CompiledSpec; isList: boolean }> = [
  { header: '# Task', field: 'task', isList: false },
  { header: '# Context', field: 'context', isList: false },
  { header: '# Known Requirements', field: 'known_requirements', isList: true },
  { header: '# Inferred Requirements', field: 'inferred_requirements', isList: true },
  { header: '# Implementation Strategy', field: 'implementation_strategy', isList: true },
  { header: '# Constraints', field: 'constraints', isList: true },
  { header: '# Quality Expectations', field: 'quality_expectations', isList: true },
  { header: '# Validation Checklist', field: 'validation_checklist', isList: true },
  { header: '# Output Requirements', field: 'output_requirements', isList: true },
];

const FEW_SHOT_REQUEST = 'add login and make it secure, use the db we already have';

const FEW_SHOT_OUTPUT: CompiledSpec = {
  directive: 'Implement a secure login flow backed by the existing database and deliver a verified result.',
  task: 'Implement user login and logout backed by the existing database.',
  context: 'The project already has a database; no new datastore should be introduced.',
  known_requirements: ['Add a login feature.', 'Make it secure.', 'Use the existing database.'],
  inferred_requirements: [
    'Passwords are hashed, never stored or logged in plain text.',
    'Sessions or tokens are invalidated on logout.',
    'Failed login attempts do not reveal whether the username exists.',
  ],
  implementation_strategy: [
    'Add a users/credentials table or reuse an existing one in the current database.',
    'Implement a login endpoint that verifies credentials and issues a session or token.',
    'Implement a logout endpoint that invalidates the session or token.',
  ],
  constraints: ['Do not introduce a new database or ORM beyond what already exists.'],
  quality_expectations: ['Input validation on the login form and endpoint.', 'Clear error handling on failure.'],
  validation_checklist: [
    'Verify a correct login succeeds and an incorrect one is rejected.',
    'Verify logout invalidates the session or token.',
    'Verify passwords are never stored or logged in plain text.',
  ],
  output_requirements: ['Return the implementation and concise validation evidence.'],
};

export function buildPrompt(userInput: string): string {
  return `You are a Prompt Compiler. You turn a rough, incomplete request into a structured, implementation-ready specification for another AI to execute directly. Compile the request, do not restate it as something to analyze.

Rules:
- Only include a requirement in "known_requirements" if the user actually said it. Everything you add yourself goes in "inferred_requirements" instead.
- Infer only what is standard practice or technically necessary for this exact request. Do not invent a specific vendor, library or product unless the user named one.
- Keep the user's original intent and scope; do not expand it into a different task.
- Any list that does not apply to this request must be an empty array — never pad it.

Return ONE valid JSON object and nothing else, with exactly these keys: ${SPEC_KEYS.join(', ')}.
"directive", "task" and "context" are strings. All other keys are arrays of short strings.

Example.
Request: "${FEW_SHOT_REQUEST}"
Output:
${JSON.stringify(FEW_SHOT_OUTPUT)}

Now compile this request the same way.
Request: "${userInput}"
Output:`;
}

/** Extracts the first top-level {...} object from raw model output, tolerating leading/trailing
 * text a small model may add around the JSON despite the prompt's instruction not to. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/** Finds the structural start of `"key"` as a JSON object key — preceded by `,` or `{`, not just
 * anywhere the substring happens to occur (which free-text field content could otherwise trigger,
 * e.g. a requirement that mentions "the task"). Returns the index of the opening `"`. */
function findKeyStart(raw: string, key: string, from = 0): number {
  const afterComma = raw.indexOf(`,"${key}"`, from);
  if (afterComma !== -1) return afterComma + 1;
  const afterBrace = raw.indexOf(`{"${key}"`, from);
  return afterBrace === -1 ? -1 : afterBrace + 1;
}

/** Streaming-time parse: returns only the fields whose value is fully present in the buffer so
 * far, bounded by the next field's key marker (or the closing `}` for the last field). A field
 * that has started but not yet closed is left unset rather than guessed at. This is what lets the
 * UI render completed sections as they arrive instead of the raw JSON buffer while generation is
 * still in progress. */
export function parsePartialSpec(raw: string): Partial<CompiledSpec> {
  const result: Partial<CompiledSpec> = {};
  for (const [i, key] of SPEC_KEYS.entries()) {
    const keyStart = findKeyStart(raw, key);
    if (keyStart === -1) break;

    const colonIndex = raw.indexOf(':', keyStart);
    if (colonIndex === -1) break;
    const valueStart = colonIndex + 1;

    const nextKey = SPEC_KEYS[i + 1];
    let segment: string | null;
    if (nextKey) {
      const nextKeyStart = findKeyStart(raw, nextKey, valueStart);
      if (nextKeyStart === -1) break; // this field is still streaming — stop, don't guess
      const commaIndex = raw.lastIndexOf(',', nextKeyStart);
      segment = raw.slice(valueStart, commaIndex > valueStart ? commaIndex : nextKeyStart);
    } else {
      const closeIndex = raw.lastIndexOf('}');
      if (closeIndex === -1 || closeIndex < valueStart) break;
      segment = raw.slice(valueStart, closeIndex);
    }

    try {
      const value = JSON.parse(segment.trim());
      if (LIST_FIELDS.has(key)) (result as Record<string, unknown>)[key] = asStringArray(value);
      else if (typeof value === 'string') (result as Record<string, unknown>)[key] = value;
    } catch {
      break; // malformed so far — stop rather than render a guess
    }
  }
  return result;
}

/** Best-effort parse: a valid JSON object wins outright; anything else still renders instead of
 * failing the whole request, matching the project's existing safe-fallback philosophy — the raw
 * text becomes the "task" field so nothing the model produced is silently discarded. */
export function parseCompiledSpec(raw: string, fallbackTask: string): CompiledSpec {
  const jsonText = extractJsonObject(raw);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return {
        directive: typeof parsed.directive === 'string' ? parsed.directive : '',
        task: typeof parsed.task === 'string' && parsed.task.trim() ? parsed.task : fallbackTask,
        context: typeof parsed.context === 'string' ? parsed.context : '',
        known_requirements: asStringArray(parsed.known_requirements),
        inferred_requirements: asStringArray(parsed.inferred_requirements),
        implementation_strategy: asStringArray(parsed.implementation_strategy),
        constraints: asStringArray(parsed.constraints),
        quality_expectations: asStringArray(parsed.quality_expectations),
        validation_checklist: asStringArray(parsed.validation_checklist),
        output_requirements: asStringArray(parsed.output_requirements),
      };
    } catch {
      // fall through to the raw-text fallback below
    }
  }
  return {
    directive: '',
    task: fallbackTask,
    context: raw.trim(),
    known_requirements: [],
    inferred_requirements: [],
    implementation_strategy: [],
    constraints: [],
    quality_expectations: [],
    validation_checklist: [],
    output_requirements: [],
  };
}

/** Renders a compiled spec to Markdown in COMPILER_SECTIONS order. Empty or not-yet-present
 * sections are skipped — no dangling headers — mirroring `workflow.build_specification` on the
 * server. Accepts a `Partial<CompiledSpec>` so the same renderer serves both the live streaming
 * parse (fields arrive incrementally) and the final full parse. */
export function renderSpec(spec: Partial<CompiledSpec>): string {
  const parts: string[] = [];
  const directive = spec.directive?.trim();
  if (directive) parts.push(directive, '');

  for (const { header, field, isList } of COMPILER_SECTIONS) {
    const value = spec[field];
    if (isList) {
      const items = (value as string[] | undefined) ?? [];
      if (items.length === 0) continue;
      parts.push(header, ...items.map((item) => `- ${item}`), '');
    } else {
      const text = (value as string | undefined)?.trim() ?? '';
      if (!text) continue;
      parts.push(header, text, '');
    }
  }

  return parts.join('\n').trim();
}

/** Provenance of a section's contents — the distinction the compiler actually tracks
 * (RFC-0017 § 5): what the user stated, versus what the compiler supplied on their behalf.
 * The UI renders these differently; `neutral` sections are derived from both. */
export type Provenance = 'explicit' | 'inferred' | 'neutral';

export interface SectionMeta {
  /** Human label for the UI. `COMPILER_SECTIONS` carries the Markdown header for the export. */
  label: string;
  field: keyof CompiledSpec;
  isList: boolean;
  provenance: Provenance;
}

/** UI-facing view of `COMPILER_SECTIONS`, same order and same fields — derived from it rather
 * than restated, so the two can never drift apart. */
export const SECTION_META: SectionMeta[] = COMPILER_SECTIONS.map(({ header, field, isList }) => ({
  label: header.replace(/^#\s*/, ''),
  field,
  isList,
  provenance: field === 'known_requirements' ? 'explicit' : field === 'inferred_requirements' ? 'inferred' : 'neutral',
}));

/**
 * Drops the inferences the user rejected. Only `inferred_requirements` is filtered: the explicit
 * requirements are theirs and are never dropped, and the derived sections stay as compiled.
 * Applied before both rendering and export so what is copied always matches what is on screen.
 */
export function applyDismissals(spec: Partial<CompiledSpec>, dismissed: ReadonlySet<string>): Partial<CompiledSpec> {
  if (dismissed.size === 0) return spec;
  const inferred = spec.inferred_requirements;
  if (!inferred?.length) return spec;
  return { ...spec, inferred_requirements: inferred.filter((item) => !dismissed.has(item)) };
}
