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

/** Renders a compiled spec to Markdown in COMPILER_SECTIONS order. Empty sections are skipped —
 * no dangling headers — mirroring `workflow.build_specification` on the server. */
export function renderSpec(spec: CompiledSpec): string {
  const parts: string[] = [];
  if (spec.directive.trim()) parts.push(spec.directive.trim(), '');

  for (const { header, field, isList } of COMPILER_SECTIONS) {
    const value = spec[field];
    if (isList) {
      const items = value as string[];
      if (items.length === 0) continue;
      parts.push(header, ...items.map((item) => `- ${item}`), '');
    } else {
      const text = (value as string).trim();
      if (!text) continue;
      parts.push(header, text, '');
    }
  }

  return parts.join('\n').trim();
}
