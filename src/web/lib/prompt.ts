/**
 * Compiler prompts for the browser tier. Same output schema and section order as the server-side
 * compiler (`src/server/modules/prompt_enhancer/prompts.py` — COMPILER_PROMPT, INTENT_SPEC_FIELDS,
 * COMPILER_SECTIONS), so a compiled spec is structurally identical across surfaces.
 *
 * The instruction body is NOT a copy of COMPILER_PROMPT, and the difference is the point. That
 * prompt is tuned for an 8B model whose failure mode is padding, which is why it says "prefer few
 * precise items over many vague ones … never pad". A 1.7B model fails in the opposite direction:
 * on a live request it returned a structurally perfect spec in which every list held exactly one
 * generic sentence. Carrying the server's density rule across would have reinforced that.
 *
 * What did carry across, after being dropped in the first version of this file and traced as the
 * root cause: TASK KIND classification and the DOMAIN / TECHNICAL EXPANSION policies. Without them
 * the model has nothing to expand from and emits filler.
 */

import { classifyTaskKind, type TaskKind } from './task-kind';

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

/* ------------------------------------------------------------------ pass definitions */

/**
 * Compilation runs as three focused passes rather than one ten-field call.
 *
 * A 1.7B model asked for ten fields at once produces a structurally valid but empty spec — the
 * observed failure was every list collapsing to exactly one generic item. The server solves the
 * same problem with `run_enhancement_field_loop` (one field per call, RFC-0005), but ten sequential
 * on-device generations is too slow; three grouped passes keep the decomposition benefit at a
 * third of the round trips. Each pass sees the previous passes' output.
 *
 * Per-pass budgets stay tight on purpose. `strategies.py` records a measured amendment
 * (2026-07-07): raising a single field's budget from 320 to 960 tokens was reverted because the
 * real model, given more room, "fills with repetitive filler … instead of stopping". More tokens
 * is not the fix here.
 */
export interface CompilePass {
  id: 'ground' | 'expand' | 'bound';
  label: string;
  fields: Array<keyof CompiledSpec>;
  maxTokens: number;
}

export const COMPILE_PASSES: CompilePass[] = [
  {
    id: 'ground',
    label: 'Reading the request',
    fields: ['directive', 'task', 'context', 'known_requirements'],
    maxTokens: 360,
  },
  {
    id: 'expand',
    label: 'Inferring requirements',
    fields: ['inferred_requirements', 'implementation_strategy'],
    maxTokens: 420,
  },
  {
    id: 'bound',
    label: 'Setting bounds and checks',
    fields: ['constraints', 'quality_expectations', 'validation_checklist', 'output_requirements'],
    maxTokens: 420,
  },
];

/* ------------------------------------------------------------------ shared rule blocks */

/** Built from the actual filler the 1.7B model emitted on a live request. Naming the offenders
 * beats an abstract "be specific" instruction, which a model this size cannot operationalise. */
const ANTI_FILLER = `NEVER write empty filler. These exact phrases are banned:
"follows best practices", "well-structured", "as needed", "if necessary", "create a new directory",
"ensure it works correctly", "proper implementation", "appropriate structure".
Test every item: if it could be pasted unchanged into a completely different request, it is filler —
delete it and write something that only makes sense for THIS request.`;

/** Targets an observed hallucination: the model asserted the framework was "already installed and
 * configured" when the user had said nothing of the kind. */
const ANTI_INVENTION = `NEVER claim something already exists, is already installed, or is already configured
unless the user said so. If you do not know, do not assert it.`;

/** The server's CAPABILITY OVER IMPLEMENTATION rule (prompts.py), condensed. Keeps the compiler
 * from naming vendors the user did not choose, while still allowing the framework they DID name. */
const CAPABILITY_RULE = `Describe capabilities, not vendor products. Do not name a specific library or service
(ORM, auth provider, state manager) unless the user named it. The framework or language the user named
is theirs to keep — use it and its real vocabulary.`;

function densityRule(kind: TaskKind): string {
  // Deliberately NOT the server's "prefer few precise items over many vague ones / never pad".
  // That rule is calibrated for an 8B model whose failure mode is padding; this model's failure
  // mode is the opposite, so the same words would reinforce the bug.
  return kind === 'technical'
    ? `Produce 3 to 6 items per list. One item, or a single generic sentence, means you did not do the work.
Every item must be concrete enough that a developer could act on it without asking a follow-up question.`
    : `Produce 2 to 4 items per list, each specific to this request.`;
}

function expansionPolicy(kind: TaskKind): string {
  if (kind !== 'technical') {
    return `DOMAIN EXPANSION: if the request names a field (legal, healthcare, finance, education, ...),
infer that field's standard concepts, terminology and expectations.`;
  }
  return `TECHNICAL EXPANSION POLICY — this is the part that makes the specification worth reading.
Infer the implementation dimensions a senior engineer would assume but the user did not spell out:
project structure, routing, data modelling, error and empty states, responsive behaviour,
accessibility, typing, testing, performance, maintainability.

NAME THE REAL PRIMITIVES. When the request names a framework, library or language, infer the concrete
artefacts THAT technology actually uses — its own file extensions, directory conventions, routing model,
configuration files and APIs. Use its real vocabulary. A generic answer that would fit any technology
means you have not applied this rule.

${CAPABILITY_RULE}`;
}

/* ------------------------------------------------------------------ few-shots */

/**
 * Two worked examples, both showing dense, technology-specific lists — the property the model was
 * failing to reproduce from a single thin example.
 *
 * Neither is a static-site generator, and neither is Astro. That is deliberate: the request that
 * exposed this bug was an Astro one, and few-shotting the same tool would turn the next test into a
 * recall check rather than a test of generalisation. These teach the *pattern* (framework → its own
 * primitives) and leave the real test honest.
 */
const FEW_SHOTS: Array<{ request: string; output: Partial<CompiledSpec> }> = [
  {
    request: 'add login and make it secure, use the db we already have',
    output: {
      directive: 'Implement a secure login and logout flow on the existing database, and report how you verified it.',
      task: 'Add credential-based authentication with session invalidation to the current application.',
      context: 'A database already exists and must be reused; no new datastore is in scope.',
      known_requirements: ['Add a login feature.', 'Make it secure.', 'Use the existing database.'],
      inferred_requirements: [
        'Store passwords as salted hashes, never plain text, and never log them.',
        'Invalidate the session or token server-side on logout, not only in the client.',
        'Return an identical error for unknown user and wrong password, so the response does not reveal which accounts exist.',
        'Rate-limit repeated failed attempts against the same account or address.',
        'Mark the session cookie HttpOnly and Secure, with a documented expiry.',
      ],
      implementation_strategy: [
        'Add a credentials table keyed to the existing user record, holding the hash and its algorithm parameters.',
        'Add a login handler that verifies the hash in constant time and issues a session on success.',
        'Add a logout handler that deletes the server-side session record.',
        'Add middleware that rejects unauthenticated requests to protected routes.',
      ],
    },
  },
  {
    request: 'make me a dashboard page in nextjs',
    output: {
      directive: 'Build a dashboard route in the existing Next.js application and report how you verified it renders.',
      task: 'Add a dashboard page with data loading, loading and empty states to the Next.js app.',
      context: 'The application uses Next.js; no data source or auth model was specified.',
      known_requirements: ['Add a dashboard page.', 'Build it in Next.js.'],
      inferred_requirements: [
        'Place the route under `app/dashboard/page.tsx` following the App Router convention.',
        'Fetch data in a Server Component and keep client-side JavaScript to what interactivity requires.',
        'Provide `loading.tsx` and `error.tsx` boundaries for the route segment.',
        'Render an explicit empty state when the query returns no rows.',
        'Type the data shape and export it, rather than passing untyped objects to the view.',
      ],
      implementation_strategy: [
        'Create the `app/dashboard/` segment with `page.tsx`, `loading.tsx` and `error.tsx`.',
        'Define the typed data-access function the page awaits, isolated from the component.',
        'Compose the page from presentational components that receive typed props.',
        'Add responsive layout rules so the panels reflow on narrow viewports.',
      ],
    },
  },
];

function fewShotBlock(fields: Array<keyof CompiledSpec>): string {
  return FEW_SHOTS.map(({ request, output }) => {
    const slice: Record<string, unknown> = {};
    for (const field of fields) if (output[field] !== undefined) slice[field] = output[field];
    return `Request: "${request}"\nOutput: ${JSON.stringify(slice)}`;
  }).join('\n\n');
}

/* ------------------------------------------------------------------ pass prompts */

const FIELD_RULES: Record<keyof CompiledSpec, string> = {
  directive: 'one imperative sentence addressed to the AI that will do the work, opening with a verb.',
  task: 'one sentence naming the actual engineering work. It must NOT repeat "directive" — if both would be the same sentence, rewrite this one to say what is being built rather than what to do.',
  context:
    'the minimal background needed to execute. State only what the user gave you. Empty string if they gave none.',
  known_requirements: 'ONLY things the user literally said. Nothing you inferred. Usually 1-4 items.',
  inferred_requirements: 'what the user did NOT say but a senior engineer would assume. This is where the value is.',
  implementation_strategy: 'ordered, concrete steps naming real files, modules or components.',
  constraints: 'genuine limits implied by the request. Empty array if the request implies none.',
  quality_expectations: 'observable properties of a good result, not adjectives.',
  validation_checklist: 'checks whose outcome is pass or fail, each naming what is being checked.',
  output_requirements: 'what the executing AI must hand back.',
};

/** Builds the prompt for one pass. `prior` carries the already-compiled fields so later passes stay
 * consistent with earlier ones instead of re-deriving the request from scratch. */
export function buildPassPrompt(pass: CompilePass, userInput: string, prior: Partial<CompiledSpec>): string {
  const kind = classifyTaskKind(userInput);
  const fieldList = pass.fields.map((field) => `- "${field}": ${FIELD_RULES[field]}`).join('\n');
  const priorBlock = Object.keys(prior).length
    ? `\nAlready compiled — stay consistent with it and do not repeat it:\n${JSON.stringify(prior)}\n`
    : '';

  const policy =
    pass.id === 'expand'
      ? `\n${expansionPolicy(kind)}\n\n${densityRule(kind)}\n`
      : pass.id === 'bound'
        ? `\n${densityRule(kind)}\n`
        : `\nExtract only. Do not infer anything in this step — inferences come later.\n`;

  return `You are an intent-to-specification compiler. You turn an incomplete request into a specification another AI executes without asking questions.

TASK KIND: ${kind}

REQUEST:
"${userInput}"
${priorBlock}${policy}
${ANTI_INVENTION}

${ANTI_FILLER}

Return ONE JSON object and nothing else, with exactly these keys:
${fieldList}

Write the output in English regardless of the language of the request.

Examples of the expected density and specificity:
${fewShotBlock(pass.fields)}

Now produce the JSON for the request above.
Output:`;
}

/** Kept as the single-call path for engines with schema-constrained decoding, where the model
 * cannot drift structurally and the decomposition buys much less. */
export function buildPrompt(userInput: string): string {
  const kind = classifyTaskKind(userInput);
  const fieldList = SPEC_KEYS.map((field) => `- "${field}": ${FIELD_RULES[field]}`).join('\n');

  return `You are an intent-to-specification compiler. You turn an incomplete request into a specification another AI executes without asking questions.

TASK KIND: ${kind}

REQUEST:
"${userInput}"

${expansionPolicy(kind)}

${densityRule(kind)}

${ANTI_INVENTION}

${ANTI_FILLER}

Return ONE JSON object and nothing else, with exactly these keys:
${fieldList}

Write the output in English regardless of the language of the request.

Examples of the expected density and specificity:
${fewShotBlock([...SPEC_KEYS])}

Now produce the JSON for the request above.
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

/** The field currently being generated, with whatever text has arrived for it. */
export interface ActiveField {
  field: keyof CompiledSpec;
  /** For a string field: the partial string. For a list: the item currently being written. */
  partialText: string;
  /** List items already closed inside the in-progress array. */
  completedItems: string[];
  isList: boolean;
}

export interface StreamingSpec {
  complete: Partial<CompiledSpec>;
  active: ActiveField | null;
}

/** Reads the partial JSON string literal that is still being written, decoding the escapes a model
 * emits mid-token (`\n`, `\"`) without waiting for the closing quote. Returns null when the buffer
 * is not currently inside a string. */
function readOpenString(buffer: string, from: number): string | null {
  const quote = buffer.indexOf('"', from);
  if (quote === -1) return null;
  let out = '';
  for (let i = quote + 1; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch === '\\') {
      const next = buffer[i + 1];
      if (next === undefined) return out; // escape split across tokens
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      i++;
      continue;
    }
    if (ch === '"') return null; // string closed — not the active one
    out += ch;
  }
  return out;
}

/**
 * Streaming parse for the typewriter reveal.
 *
 * `parsePartialSpec` only emits fields that have fully closed, which is why the UI revealed whole
 * cards at once. This additionally exposes the field currently being written — including a
 * half-finished sentence — so text appears character by character as the model produces it.
 */
export function parseStreamingSpec(raw: string): StreamingSpec {
  const complete = parsePartialSpec(raw);
  const completedCount = Object.keys(complete).length;
  const key = SPEC_KEYS[completedCount];
  if (!key) return { complete, active: null };

  const keyStart = findKeyStart(raw, key);
  if (keyStart === -1) return { complete, active: null };
  const colonIndex = raw.indexOf(':', keyStart);
  if (colonIndex === -1) return { complete, active: null };

  const isList = LIST_FIELDS.has(key);
  const tail = raw.slice(colonIndex + 1);

  if (!isList) {
    const partialText = readOpenString(raw, colonIndex + 1);
    return partialText === null
      ? { complete, active: null }
      : { complete, active: { field: key, partialText, completedItems: [], isList: false } };
  }

  const bracket = tail.indexOf('[');
  if (bracket === -1) return { complete, active: null };

  // Closed items inside the still-open array, plus the one being written.
  const inner = tail.slice(bracket + 1);
  const completedItems: string[] = [];
  let cursor = 0;
  for (;;) {
    const open = inner.indexOf('"', cursor);
    if (open === -1) break;
    let end = -1;
    for (let i = open + 1; i < inner.length; i++) {
      if (inner[i] === '\\') {
        i++;
        continue;
      }
      if (inner[i] === '"') {
        end = i;
        break;
      }
    }
    if (end === -1) {
      const partialText = readOpenString(inner, open) ?? '';
      return { complete, active: { field: key, partialText, completedItems, isList: true } };
    }
    try {
      completedItems.push(JSON.parse(inner.slice(open, end + 1)) as string);
    } catch {
      break;
    }
    cursor = end + 1;
  }

  return { complete, active: { field: key, partialText: '', completedItems, isList: true } };
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
