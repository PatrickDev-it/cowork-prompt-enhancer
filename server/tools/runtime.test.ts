import { describe, expect, test } from 'bun:test';
import { collectCompressFields } from './runtime';
import type { PromptDescriptor } from './types';

describe('collectCompressFields', () => {
  test('collects a top-level compress: true field', () => {
    const prompts: PromptDescriptor[] = [
      { key: 'input', name: 'message', props: {} },
      { key: 'input', name: 'payload', props: {}, compress: true },
    ];
    expect(collectCompressFields(prompts)).toEqual(new Set(['payload']));
  });

  test('regression: collects a compress: true field nested under sub_prompts', () => {
    // Exact shape of the historical bug (server/tools/dev-prompt-enhancer.ts, RFC-0021 § 2): a
    // `project-select` field declared compress:true only inside `sub_prompts['read-project']`,
    // reachable only when that checkbox option is selected. Looking at `tool.prompts` alone missed
    // it — an 18k-token raw payload went uncompressed into the compiler, blowing past its HTTP
    // timeout and silently falling back to the slow field_loop path.
    const prompts: PromptDescriptor[] = [
      {
        key: 'checkbox',
        name: 'options',
        props: {},
        sub_prompts: {
          'read-project': [{ key: 'project-select', name: 'project', props: {}, compress: true }],
        },
      },
    ];
    expect(collectCompressFields(prompts)).toEqual(new Set(['project']));
  });

  test('recurses into arbitrarily nested sub_prompts branches', () => {
    const prompts: PromptDescriptor[] = [
      {
        key: 'checkbox',
        name: 'outer',
        props: {},
        sub_prompts: {
          branch: [
            {
              key: 'checkbox',
              name: 'inner',
              props: {},
              sub_prompts: {
                deep: [{ key: 'input', name: 'buried', props: {}, compress: true }],
              },
            },
          ],
        },
      },
    ];
    expect(collectCompressFields(prompts)).toEqual(new Set(['buried']));
  });

  test('returns an empty set when no field declares compress: true', () => {
    const prompts: PromptDescriptor[] = [{ key: 'input', name: 'message', props: {} }];
    expect(collectCompressFields(prompts)).toEqual(new Set());
  });

  test('returns an empty set for undefined prompts', () => {
    expect(collectCompressFields(undefined)).toEqual(new Set());
  });
});
