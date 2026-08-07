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

import { classifyDomain, DOMAIN_DIMENSIONS } from './domain';

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
 * Compilation runs as two focused passes rather than one ten-field call.
 *
 * A 1.7B model asked for the whole envelope at once returns a structurally valid but empty spec —
 * the first observed failure was every list collapsing to one generic item. Splitting extraction
 * from inference is the part worth paying for: it is what stops the model blending what the user
 * said with what it assumed, which is the product's entire claim.
 *
 * Two rather than three, because prefill is compute-bound and each pass pays it again. The
 * previous three-pass version tripled the prompt count while also tripling prompt length, which is
 * the latency the user felt. `constraints` / `quality_expectations` / `validation_checklist` /
 * `output_requirements` are *derived* from the inference rather than independently inferred, so
 * they ride along with the expand pass at almost no quality cost.
 *
 * Budgets stay tight: `strategies.py` records a measured amendment where raising a small model's
 * per-unit budget produced repetitive filler instead of richer content.
 */
export interface CompilePass {
  id: 'ground' | 'expand';
  label: string;
  fields: Array<keyof CompiledSpec>;
  maxTokens: number;
}

export const COMPILE_PASSES: CompilePass[] = [
  {
    id: 'ground',
    label: 'Reading the request',
    fields: ['directive', 'task', 'context', 'known_requirements'],
    maxTokens: 320,
  },
  {
    id: 'expand',
    label: 'Inferring what it needs',
    fields: [
      'inferred_requirements',
      'implementation_strategy',
      'constraints',
      'quality_expectations',
      'validation_checklist',
      'output_requirements',
    ],
    maxTokens: 480,
  },
];

/* ------------------------------------------------------------------ rule blocks */

/** Built from filler this model actually emitted. Naming the offenders beats an abstract
 * "be specific", which a model this size cannot operationalise. */
const ANTI_FILLER = `Banned phrases: "follows best practices", "well-structured", "as needed",
"if necessary", "ensure it works correctly", "proper implementation". If an item would fit an
unrelated request unchanged, it is filler — replace it.`;

/** Targets two observed hallucinations: asserting a framework was "already installed and
 * configured", and importing an unrelated technology stack wholesale. The second sentence is the
 * direct guard against copying anything technology-shaped that is not in the request. */
const ANTI_INVENTION = `Never claim something already exists or is already set up unless the request said so.
Never mention a tool, framework, file type or technology the request did not mention.`;

const SLOT: Record<keyof CompiledSpec, string> = {
  directive: '"<one imperative sentence to the AI that will do the work>"',
  task: '"<one sentence naming the actual work — different wording from directive>"',
  context: '"<only background the request itself gives; empty string if none>"',
  known_requirements: '["<something the request literally said>", ...]',
  inferred_requirements: '["<3-6 items the request did NOT say but this deliverable needs>", ...]',
  implementation_strategy: '["<3-5 concrete ordered steps for this deliverable>", ...]',
  constraints: '["<limits this request implies>", ...]',
  quality_expectations: '["<observable properties of a good result, not adjectives>", ...]',
  validation_checklist: '["<checks that pass or fail>", ...]',
  output_requirements: '["<what the executing AI hands back>", ...]',
};

/**
 * The output shape, expressed as slot descriptions instead of content.
 *
 * The previous version used two rich worked examples. A 1.7B model reproduced them verbatim — an
 * email-template request came back with `app/dashboard/page.tsx` and `loading.tsx` boundaries.
 * Nothing here is worth copying because nothing here is content, and it costs a fraction of the
 * tokens, which is also most of the prefill saving.
 */
function shapeFor(fields: Array<keyof CompiledSpec>): string {
  const slots = fields.map((field) => `  "${field}": ${SLOT[field]}`).join(',\n');
  return `{\n${slots}\n}`;
}

/* ------------------------------------------------------------------ pass prompts */

function groundPrompt(userInput: string, fields: Array<keyof CompiledSpec>): string {
  return `You turn a rough request into a specification another AI executes.
This step is EXTRACTION ONLY. Do not infer or add anything — that comes next.

REQUEST:
"${userInput}"

${ANTI_INVENTION}

Return ONE JSON object, this shape:
${shapeFor(fields)}

Write in English whatever language the request uses.
Output:`;
}

function expandPrompt(userInput: string, prior: Partial<CompiledSpec>, fields: Array<keyof CompiledSpec>): string {
  const domain = classifyDomain(userInput);
  return `You turn a rough request into a specification another AI executes.
This step adds what the request did NOT say but the deliverable needs.

REQUEST:
"${userInput}"

Already extracted:
${JSON.stringify(prior)}

Think about what this specific deliverable requires. For a request like this one, consider:
${DOMAIN_DIMENSIONS[domain]}.
Those are dimensions to think about, not words to copy — infer what THIS request needs.

Produce 3 to 6 items per list. One generic item means you did not do the work.
Every item must be specific enough to act on without asking a follow-up question.
Describe capabilities, not brand-name products, unless the request named one.

${ANTI_INVENTION}

${ANTI_FILLER}

Return ONE JSON object, this shape:
${shapeFor(fields)}

Write in English whatever language the request uses.
Output:`;
}

/** Builds the prompt for one pass. `prior` carries the already-extracted fields so the inference
 * step stays anchored to the deliverable rather than re-deriving it from the raw request. */
export function buildPassPrompt(pass: CompilePass, userInput: string, prior: Partial<CompiledSpec>): string {
  return pass.id === 'ground' ? groundPrompt(userInput, pass.fields) : expandPrompt(userInput, prior, pass.fields);
}

/** Single-call path, kept for engines with schema-constrained decoding where the model cannot
 * drift structurally and the decomposition buys much less. */
export function buildPrompt(userInput: string): string {
  const domain = classifyDomain(userInput);
  return `You are an intent-to-specification compiler. You turn an incomplete request into a
specification another AI executes without asking questions.

REQUEST:
"${userInput}"

Separate what the request literally said (known_requirements) from what you added
(inferred_requirements). Never mix them.

Think about what this deliverable requires. For a request like this one, consider:
${DOMAIN_DIMENSIONS[domain]}.
Those are dimensions to think about, not words to copy.

Produce 3 to 6 items per list. One generic item means you did not do the work.

${ANTI_INVENTION}

${ANTI_FILLER}

Return ONE JSON object, this shape:
${shapeFor([...SPEC_KEYS])}

Write in English whatever language the request uses.
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
