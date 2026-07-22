import { runEnhancement } from './enhance-run';
import type { Tool } from './types';

/** General compiler tool with automatic freshness grounding and opt-in deep research. */
export const promptEnhancer: Tool = {
  name: 'prompt-enhancer',
  description: 'Compile a raw request into an implementation-ready Markdown specification.',
  prompts: [
    {
      key: 'file-select',
      name: 'request',
      // Oversized request files pass through the compression head.
      compress: true,
      props: { message: 'Which request file do you want to compile?', extensions: ['.txt', '.md', '.json', '.csv'] },
    },
    {
      // Provider reasoning remains off by default for predictable latency.
      key: 'confirm',
      name: 'think',
      props: { message: 'Enable provider reasoning? (slower and potentially more accurate)', default: false },
    },
    {
      // Deep research is explicitly opt-in because it performs multiple network/model calls.
      key: 'confirm',
      name: 'deepResearch',
      props: { message: 'Run deep research? (multi-query web search and a separate report)', default: false },
    },
  ],
  run: async (_WS, ctx) => {
    const { payload } = ctx;
    await runEnhancement(ctx, {
      request: String(payload.request ?? ''),
      think: payload.think === true,
      options: { deepResearch: payload.deepResearch === true },
    });
  },
};
