import type { Tool } from './types';

/** Tool smoke-test — RFC-0003 § 5. Verifica prompt aggiuntivi + tutte le fasi di `status`. */
export const echo: Tool = {
  name: 'echo',
  description: 'Rimanda indietro il messaggio ricevuto, dopo un avanzamento simulato in due fasi.',
  prompts: [
    {
      key: 'input',
      name: 'message',
      props: { message: 'Cosa vuoi che il server ripeta?' },
    },
  ],
  run: async (_WS, { payload, status }) => {
    status({ sub_event: 'start', message: 'Ricevuto, elaborazione in corso...' });
    await Bun.sleep(500);
    status({ sub_event: 'progress', percent: 50, message: 'Preparazione risposta...' });
    await Bun.sleep(500);
    status({ sub_event: 'done', message: `Echo: ${payload.message}` });
  },
};
