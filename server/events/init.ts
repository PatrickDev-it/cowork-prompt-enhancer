import { randomUUIDv7 } from 'bun';
import type { $WSServer } from '@/lib/ws';
import { tools } from '@/tools';

/**
 * Menu costruito dinamicamente dal registro dei tool — RFC-0003 § 3.
 * Aggiungere/rimuovere un tool in tools/ cambia questo menu senza toccare questo file.
 */
export function init(WS: $WSServer) {
  WS.emit('prompt', {
    uuid: randomUUIDv7(),
    payload: {
      prompt: {
        key: 'select',
        props: {
          message: 'Quale tool vuoi eseguire sul server?',
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
