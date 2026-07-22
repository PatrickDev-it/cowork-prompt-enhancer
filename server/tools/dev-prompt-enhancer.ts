import { runEnhancement } from './enhance-run';
import type { Tool } from './types';

/** Developer compiler grounded in project files explicitly selected by the local client (RFC-0021). */
export const devPromptEnhancer: Tool = {
  name: 'dev-prompt-enhancer',
  description: 'Compile a developer request against explicitly selected local project files.',
  prompts: [
    {
      key: 'checkbox',
      name: 'options',
      props: {
        message: 'Options (space to select, enter to continue):',
        choices: [
          { name: 'thinking', value: 'think' },
          { name: 'read project', value: 'read-project' },
          { name: 'web search', value: 'web-search' },
        ],
        loop: false,
      },
      // Resolve project selection only when requested; oversized bundles pass through compression.
      sub_prompts: {
        'read-project': [
          {
            key: 'project-select',
            name: 'project',
            compress: true,
            props: { message: 'Project directory to scan:' },
          },
        ],
      },
    },
    {
      key: 'file-select',
      name: 'request',
      compress: true,
      props: {
        message: 'What should the compiled prompt ask the executor to do?',
        extensions: ['.txt', '.md', '.json'],
      },
    },
  ],
  run: async (_WS, ctx) => {
    const { payload } = ctx;
    const options = Array.isArray(payload.options) ? (payload.options as string[]) : [];
    await runEnhancement(ctx, {
      request: String(payload.request ?? ''),
      think: options.includes('think'),
      options: {
        // The explicit UI choice overrides the automatic freshness gate.
        search: options.includes('web-search'),
        // Empty when project selection was not requested.
        projectContext: String(payload.project ?? ''),
      },
    });
  },
};
