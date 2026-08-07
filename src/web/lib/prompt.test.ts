import { describe, expect, test } from 'bun:test';
import {
  applyDismissals,
  buildPassPrompt,
  buildPrompt,
  COMPILE_PASSES,
  COMPILER_SECTIONS,
  parseCompiledSpec,
  parsePartialSpec,
  parseStreamingSpec,
  renderSpec,
  SECTION_META,
} from './prompt';

/** The exact buffer shape observed in the browser: seven fields closed, the eighth cut mid-string.
 * This is the streaming case that previously leaked raw JSON into the UI. */
const TRUNCATED_STREAM =
  '{"directive":"Enhance the responsive design.","task":"Improve the responsive design.","context":"The current design is not responsive.","known_requirements":["Improve the responsive design."],"inferred_requirements":["Use CSS Grid or Flexbox."],"implementation_strategy":["Use CSS Grid to create a responsive layout."],"constraints":["Optimize for mobile devices."],"quality_expectations":["Ensure the design ';

describe('buildPrompt', () => {
  test('carries the user request and the full key list', () => {
    const prompt = buildPrompt('add login');
    expect(prompt).toContain('add login');
    for (const { field } of COMPILER_SECTIONS) expect(prompt).toContain(field);
    expect(prompt).toContain('inferred_requirements');
  });
});

describe('parsePartialSpec', () => {
  test('returns only fields whose value is complete, stopping at the truncated one', () => {
    const partial = parsePartialSpec(TRUNCATED_STREAM);
    expect(Object.keys(partial)).toEqual([
      'directive',
      'task',
      'context',
      'known_requirements',
      'inferred_requirements',
      'implementation_strategy',
      'constraints',
    ]);
    expect(partial.quality_expectations).toBeUndefined();
    expect(partial.known_requirements).toEqual(['Improve the responsive design.']);
  });

  test('renders as markdown with no dangling header for the truncated field', () => {
    const markdown = renderSpec(parsePartialSpec(TRUNCATED_STREAM));
    expect(markdown).toContain('# Constraints');
    expect(markdown).not.toContain('# Quality Expectations');
    expect(markdown).not.toContain('{"directive"');
  });

  test('yields nothing useful from a buffer that has not closed its first field', () => {
    expect(parsePartialSpec('{"directive":"partial text with no clos')).toEqual({});
  });

  test('does not mistake field-name text inside a value for a key marker', () => {
    const raw =
      '{"directive":"mentions task and context inline","task":"Real task.","context":"c","known_requirements":[]';
    const partial = parsePartialSpec(raw);
    expect(partial.directive).toBe('mentions task and context inline');
    expect(partial.task).toBe('Real task.');
  });
});

describe('parseCompiledSpec', () => {
  test('extracts a valid object even with prose around it', () => {
    const raw =
      'Here you go:\n{"directive":"d","task":"t","context":"","known_requirements":["a"],"inferred_requirements":[],"implementation_strategy":[],"constraints":[],"quality_expectations":[],"validation_checklist":[],"output_requirements":[]}\nHope that helps.';
    const spec = parseCompiledSpec(raw, 'fallback');
    expect(spec.task).toBe('t');
    expect(spec.known_requirements).toEqual(['a']);
  });

  test('falls back without throwing when the payload is not JSON', () => {
    const spec = parseCompiledSpec('the model rambled instead', 'the original request');
    expect(spec.task).toBe('the original request');
    expect(spec.context).toBe('the model rambled instead');
  });

  test('drops non-string entries rather than rendering them', () => {
    const raw =
      '{"directive":"d","task":"t","context":"","known_requirements":["ok", 42, null, "  "],"inferred_requirements":[],"implementation_strategy":[],"constraints":[],"quality_expectations":[],"validation_checklist":[],"output_requirements":[]}';
    expect(parseCompiledSpec(raw, 'f').known_requirements).toEqual(['ok']);
  });
});

describe('renderSpec', () => {
  test('skips empty sections entirely', () => {
    const markdown = renderSpec({ task: 'Do the thing', constraints: [] });
    expect(markdown).toBe('# Task\nDo the thing');
  });

  test('puts the directive before any section header', () => {
    const markdown = renderSpec({ directive: 'Build it.', task: 'Build the thing' });
    expect(markdown.indexOf('Build it.')).toBeLessThan(markdown.indexOf('# Task'));
  });
});

describe('applyDismissals', () => {
  const spec = {
    known_requirements: ['stated by the user'],
    inferred_requirements: ['assumption A', 'assumption B'],
  };

  test('removes only the rejected inferences', () => {
    const filtered = applyDismissals(spec, new Set(['assumption A']));
    expect(filtered.inferred_requirements).toEqual(['assumption B']);
  });

  test('never touches explicit requirements', () => {
    const filtered = applyDismissals(spec, new Set(['stated by the user']));
    expect(filtered.known_requirements).toEqual(['stated by the user']);
  });

  test('is a no-op with an empty dismissal set, returning the same reference', () => {
    expect(applyDismissals(spec, new Set())).toBe(spec);
  });

  test('changes the exported markdown', () => {
    const before = renderSpec(spec);
    const after = renderSpec(applyDismissals(spec, new Set(['assumption A'])));
    expect(before).toContain('assumption A');
    expect(after).not.toContain('assumption A');
    expect(after).toContain('assumption B');
  });
});

describe('SECTION_META', () => {
  test('stays in lockstep with COMPILER_SECTIONS', () => {
    expect(SECTION_META.map((s) => s.field)).toEqual(COMPILER_SECTIONS.map((s) => s.field));
  });

  test('labels carry no markdown hashes', () => {
    for (const section of SECTION_META) expect(section.label).not.toContain('#');
  });

  test('marks exactly one explicit and one inferred section', () => {
    expect(SECTION_META.filter((s) => s.provenance === 'explicit').map((s) => s.field)).toEqual(['known_requirements']);
    expect(SECTION_META.filter((s) => s.provenance === 'inferred').map((s) => s.field)).toEqual([
      'inferred_requirements',
    ]);
  });
});

describe('COMPILE_PASSES', () => {
  test('covers every spec field exactly once', () => {
    const covered = COMPILE_PASSES.flatMap((p) => p.fields);
    expect(new Set(covered).size).toBe(covered.length);
    for (const { field } of COMPILER_SECTIONS) expect(covered).toContain(field);
    expect(covered).toContain('directive');
  });

  test('separates extraction from inference, which is the split worth its latency', () => {
    expect(COMPILE_PASSES[0]?.fields).toContain('known_requirements');
    expect(COMPILE_PASSES[0]?.fields).not.toContain('inferred_requirements');
    expect(COMPILE_PASSES[1]?.fields).toContain('inferred_requirements');
  });
});

describe('buildPassPrompt — no technology may leak from the prompt itself', () => {
  const EMAIL = 'creare un template di email riusabile da mandare a candidati di possibili lead per un progetto';
  const ASTRO = 'creami una static blog page in astro framework';

  // The live regression: every inferred requirement came back copied verbatim from a Next.js
  // few-shot. Nothing technology-shaped may appear in a prompt unless the request put it there.
  const LEAKED = [
    'app/dashboard',
    'page.tsx',
    'loading.tsx',
    'error.tsx',
    'App Router',
    'Server Component',
    'nextjs',
    'Next.js',
  ];

  test.each(COMPILE_PASSES)('pass $id leaks nothing into a non-software request', (pass) => {
    const prompt = buildPassPrompt(pass, EMAIL, { task: 'Create a reusable outreach email template.' });
    for (const token of LEAKED) expect(prompt).not.toContain(token);
  });

  test('carries communication dimensions for an email request, not software ones', () => {
    const expand = COMPILE_PASSES.find((p) => p.id === 'expand')!;
    const prompt = buildPassPrompt(expand, EMAIL, {});
    expect(prompt).toContain('subject line');
    expect(prompt).toContain('opt out');
    expect(prompt).not.toContain('routing');
  });

  test('carries software dimensions for a software request', () => {
    const expand = COMPILE_PASSES.find((p) => p.id === 'expand')!;
    const prompt = buildPassPrompt(expand, ASTRO, {});
    expect(prompt).toContain('project structure');
    expect(prompt).not.toContain('subject line');
  });

  test('contains no full example sentence a model could copy as an answer', () => {
    const expand = COMPILE_PASSES.find((p) => p.id === 'expand')!;
    const prompt = buildPassPrompt(expand, EMAIL, {});
    // Slot descriptions are angle-bracketed placeholders, never finished sentences.
    expect(prompt).toContain('<3-6 items');
    expect(prompt).not.toMatch(/Output: \{"inferred_requirements":\["[A-Z]/);
  });

  test('the ground pass forbids inference, the expand pass requires it', () => {
    expect(buildPassPrompt(COMPILE_PASSES[0]!, EMAIL, {})).toContain('EXTRACTION ONLY');
    expect(buildPassPrompt(COMPILE_PASSES[1]!, EMAIL, {})).toContain('did NOT say');
  });

  test('feeds the extracted fields forward so inference is anchored to the deliverable', () => {
    const prompt = buildPassPrompt(COMPILE_PASSES[1]!, EMAIL, { task: 'Create an outreach email template.' });
    expect(prompt).toContain('Already extracted');
    expect(prompt).toContain('Create an outreach email template.');
  });

  test('asks only for the fields the pass owns', () => {
    const ground = buildPassPrompt(COMPILE_PASSES[0]!, EMAIL, {});
    expect(ground).toContain('"known_requirements"');
    expect(ground).not.toContain('"validation_checklist"');
  });

  test('stays far shorter than the version that caused the latency complaint', () => {
    // The three-pass version ran ~700-950 tokens per prompt; ~4 chars/token puts a lean prompt
    // well under 2500 characters. This is a rough guard against prompts creeping back up.
    for (const pass of COMPILE_PASSES) {
      expect(buildPassPrompt(pass, EMAIL, {}).length).toBeLessThan(2500);
    }
  });
});

describe('buildPrompt (single-call path)', () => {
  test('adapts its dimensions to the request domain', () => {
    expect(buildPrompt('write a newsletter for our clients')).toContain('subject line');
    expect(buildPrompt('add a fastapi endpoint')).toContain('project structure');
  });

  test('leaks no technology into a non-software request', () => {
    const prompt = buildPrompt('creare un template di email per possibili lead');
    for (const token of ['page.tsx', 'app/dashboard', 'Next.js']) expect(prompt).not.toContain(token);
  });
});

describe('parseStreamingSpec', () => {
  test('exposes a string field while it is still being written', () => {
    const { active } = parseStreamingSpec('{"directive":"Build an Astro blog with cont');
    expect(active?.field).toBe('directive');
    expect(active?.partialText).toBe('Build an Astro blog with cont');
    expect(active?.isList).toBe(false);
  });

  test('exposes closed list items plus the one mid-write', () => {
    const raw = '{"directive":"d","task":"t","context":"c","known_requirements":["first item","second par';
    const { active } = parseStreamingSpec(raw);
    expect(active?.field).toBe('known_requirements');
    expect(active?.completedItems).toEqual(['first item']);
    expect(active?.partialText).toBe('second par');
  });

  test('decodes escapes that arrive mid-string', () => {
    const { active } = parseStreamingSpec('{"directive":"line one\nline t');
    expect(active?.partialText).toBe('line one\nline t');
  });

  test('reports no active field once everything has closed', () => {
    const raw =
      '{"directive":"d","task":"t","context":"","known_requirements":[],"inferred_requirements":[],"implementation_strategy":[],"constraints":[],"quality_expectations":[],"validation_checklist":[],"output_requirements":[]}';
    expect(parseStreamingSpec(raw).active).toBeNull();
  });

  test('never leaks JSON syntax into any rendered field value', () => {
    const { complete, active } = parseStreamingSpec(TRUNCATED_STREAM);
    // Every value the UI renders must be decoded content, not a slice of the wire format.
    for (const value of Object.values(complete).flat()) {
      expect(String(value)).not.toContain('":"');
      expect(String(value)).not.toContain('{"');
    }
    expect(active?.partialText ?? '').not.toContain('":"');
  });
});

/**
 * Regressions from the live bug where the second pass produced no visible output.
 *
 * Every earlier fixture in this file was a full envelope starting at `directive`, which is what
 * the FIRST pass emits. The second pass starts at `inferred_requirements`, and the parsers walked
 * the global key order and gave up when `directive` was absent — so the suite stayed green while
 * the app silently rendered nothing. These fixtures use the payload shape the second pass really
 * produces.
 */
describe('pass-scoped parsing (the second pass does not start at "directive")', () => {
  const PASS2 = COMPILE_PASSES[1]!.fields;
  const MID_STREAM =
    '{"inferred_requirements":["Define the recipient segment","Add a subject line"],"implementation_strategy":["Draft the body';

  test('parsePartialSpec reads a payload that starts mid-envelope', () => {
    expect(parsePartialSpec(MID_STREAM, PASS2)).toEqual({
      inferred_requirements: ['Define the recipient segment', 'Add a subject line'],
    });
  });

  test('without the field list it parses nothing — the exact shape of the bug', () => {
    expect(parsePartialSpec(MID_STREAM)).toEqual({});
  });

  test('parseStreamingSpec exposes the in-flight field, so the typewriter runs', () => {
    const { active } = parseStreamingSpec(MID_STREAM, PASS2);
    expect(active?.field).toBe('implementation_strategy');
    expect(active?.partialText).toBe('Draft the body');
  });

  test('every pass can parse its own first field', () => {
    for (const pass of COMPILE_PASSES) {
      const first = pass.fields[0]!;
      const raw = `{"${first}":${first.includes('_') && first !== 'known_requirements' ? '["x"]' : '"x"'}`;
      // Not asserting the value, only that the parser engages instead of bailing on key order.
      expect(() => parseStreamingSpec(raw, pass.fields)).not.toThrow();
    }
  });
});

describe('truncation salvage', () => {
  const PASS2 = COMPILE_PASSES[1]!.fields;

  test('keeps completed fields when the generation stopped before the closing brace', () => {
    // Hitting the token cap leaves no balanced object; discarding the payload for a missing `}`
    // is what made the later sections disappear instead of filling.
    const truncated =
      '{"inferred_requirements":["Segment the recipients","Write a subject line","State one call to action"],"implementation_strategy":["Draft the';
    const spec = parseCompiledSpec(truncated, 'fallback', PASS2);
    expect(spec.inferred_requirements).toHaveLength(3);
  });

  test('keeps the completed items of the list that was mid-write', () => {
    const truncated = '{"inferred_requirements":["first","second","thi';
    const spec = parseCompiledSpec(truncated, 'fallback', PASS2);
    expect(spec.inferred_requirements).toEqual(['first', 'second']);
  });

  test('a well-formed payload still takes the fast path unchanged', () => {
    const whole =
      '{"inferred_requirements":["a"],"implementation_strategy":["b"],"constraints":[],"quality_expectations":[],"validation_checklist":[],"output_requirements":[]}';
    const spec = parseCompiledSpec(whole, 'fallback', PASS2);
    expect(spec.inferred_requirements).toEqual(['a']);
    expect(spec.implementation_strategy).toEqual(['b']);
  });

  test('still falls back to raw text when there is nothing structured at all', () => {
    const spec = parseCompiledSpec('the model just wrote prose', 'the request');
    expect(spec.task).toBe('the request');
    expect(spec.context).toBe('the model just wrote prose');
  });
});

describe('pass budgets scale with the number of fields', () => {
  test('every pass can fit the output it asks for', () => {
    // A flat per-field floor is the wrong model: three short strings cost far less than six lists
    // of 3-6 items. 480 tokens across SIX lists was the under-allocation that truncated pass 2
    // mid-object. Budget roughly 40 tokens for a scalar field and 130 for a list.
    const LIST_FIELDS = new Set(COMPILER_SECTIONS.filter((s) => s.isList).map((s) => s.field));
    for (const pass of COMPILE_PASSES) {
      const lists = pass.fields.filter((f) => LIST_FIELDS.has(f)).length;
      const scalars = pass.fields.length - lists;
      expect(pass.maxTokens).toBeGreaterThanOrEqual(scalars * 40 + lists * 130);
    }
  });

  test('and stays under the per-field ceiling the server measured', () => {
    // strategies.py: 960 tokens for a single field produced repetitive filler; 320/field is the
    // point that was kept. This encodes the lesson per field rather than per call.
    for (const pass of COMPILE_PASSES) {
      expect(pass.maxTokens / pass.fields.length).toBeLessThanOrEqual(320);
    }
  });
});
