import { randomUUIDv7 } from 'bun';
import type { $WSServer } from '@/lib/ws';
import { tools } from '@/tools';

/**
 * Build the menu dynamically from the tool registry (RFC-0003 § 3). Adding or removing a tool changes
 * the menu without changing this module.
 */
export function init(WS: $WSServer) {
  WS.emit('prompt', {
    uuid: randomUUIDv7(),
    payload: {
      prompt: {
        key: 'select',
        props: {
          message: 'Which server tool do you want to run?',
          choices: Object.values(tools).map((tool) => ({
            name: `${tool.name} — ${tool.description}`,
            value: tool.name,
          })),
        },
      },
      sub_prompts: Object.fromEntries(
        Object.values(tools).map((tool) => [tool.name, { sub_event: 'init', prompts: tool.prompts ?? [] }])
      ),
    },
  });
}
