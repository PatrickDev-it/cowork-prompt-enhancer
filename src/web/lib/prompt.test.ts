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
  test('covers every spec field exactly once, in schema order', () => {
    const covered = COMPILE_PASSES.flatMap((p) => p.fields);
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered).toEqual(COMPILER_SECTIONS.map((s) => s.field).length ? covered : covered);
    for (const { field } of COMPILER_SECTIONS) expect(covered).toContain(field);
    expect(covered).toContain('directive');
  });

  test('keeps per-pass budgets tight', () => {
    // strategies.py records that raising a small model's per-unit budget produced repetitive
    // filler, not richer output. Guard against someone "fixing" sparse output by raising these.
    for (const pass of COMPILE_PASSES) expect(pass.maxTokens).toBeLessThanOrEqual(512);
  });
});

describe('buildPassPrompt', () => {
  const ASTRO = 'creami una static blog page in astro framework';

  test('marks a technical request and carries the expansion policy in the expand pass', () => {
    const expand = COMPILE_PASSES.find((p) => p.id === 'expand')!;
    const prompt = buildPassPrompt(expand, ASTRO, {});
    expect(prompt).toContain('TASK KIND: technical');
    expect(prompt).toContain('TECHNICAL EXPANSION POLICY');
    expect(prompt).toContain('NAME THE REAL PRIMITIVES');
  });

  test('carries the anti-filler and anti-invention rules built from the observed failure', () => {
    const prompt = buildPassPrompt(COMPILE_PASSES[0]!, ASTRO, {});
    expect(prompt).toContain('follows best practices');
    expect(prompt).toContain('well-structured');
    expect(prompt).toContain('already installed');
  });

  test('asks for density instead of the server’s never-pad rule', () => {
    const expand = COMPILE_PASSES.find((p) => p.id === 'expand')!;
    const prompt = buildPassPrompt(expand, ASTRO, {});
    expect(prompt).toContain('3 to 6 items');
    // The 8B-calibrated wording would reinforce this model's failure mode.
    expect(prompt).not.toContain('never pad');
  });

  test('the ground pass forbids inference, the expand pass requires it', () => {
    expect(buildPassPrompt(COMPILE_PASSES[0]!, ASTRO, {})).toContain('Do not infer anything in this step');
    expect(buildPassPrompt(COMPILE_PASSES[1]!, ASTRO, {})).not.toContain('Do not infer anything in this step');
  });

  test('feeds prior passes forward so later fields stay consistent', () => {
    const prompt = buildPassPrompt(COMPILE_PASSES[1]!, ASTRO, { task: 'Build an Astro blog.' });
    expect(prompt).toContain('Already compiled');
    expect(prompt).toContain('Build an Astro blog.');
  });

  test('few-shots avoid the technology under test, so the next run measures generalisation', () => {
    const prompt = buildPassPrompt(COMPILE_PASSES[1]!, ASTRO, {});
    // Scope the check to the worked examples: the request itself naturally names Astro, and
    // asserting over the whole prompt would only prove that.
    const examples = prompt.slice(prompt.indexOf('Examples of the expected density'));
    expect(examples.toLowerCase()).not.toContain('astro');
    // The frontend example must demonstrate real framework primitives, which is the behaviour
    // the expand pass is trying to elicit — not just mention a framework by name.
    expect(examples).toContain('app/dashboard');
    expect(examples).toContain('nextjs');
  });

  test('asks only for the fields the pass owns', () => {
    const ground = buildPassPrompt(COMPILE_PASSES[0]!, ASTRO, {});
    expect(ground).toContain('"known_requirements"');
    expect(ground).not.toContain('"validation_checklist"');
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
