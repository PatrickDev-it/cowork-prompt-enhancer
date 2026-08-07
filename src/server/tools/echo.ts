import type { Tool } from './types';

/** Tool smoke-test — RFC-0003 § 5. Verifica prompt aggiuntivi + tutte le fasi di `status`. */
export const echo: Tool = {
  name: 'echo',
  description: 'Return a message after a two-stage simulated operation.',
  prompts: [
    {
      key: 'input',
      name: 'message',
      props: { message: 'What should the server return?' },
    },
  ],
  run: async (_WS, { payload, status }) => {
    status({ sub_event: 'start', message: 'Message received; processing...' });
    await Bun.sleep(500);
    status({ sub_event: 'progress', percent: 50, message: 'Preparing response...' });
    await Bun.sleep(500);
    status({ sub_event: 'done', message: `Echo: ${payload.message}` });
  },
};
