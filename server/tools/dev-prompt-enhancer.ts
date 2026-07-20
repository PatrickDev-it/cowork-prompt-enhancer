import { runEnhancement } from './enhance-run';
import type { Tool } from './types';

/**
 * Prompt-enhancer verticale per sviluppatori — RFC-0021. Riusa il modulo `prompt_enhancer` (non lo
 * forka) passandogli il CONTESTO DEL PROGETTO locale del client, così il prompt prodotto è ancorato
 * al codice reale invece di indovinare stack e struttura.
 *
 * Wizard (prompt bridge, RFC-0002 § 6 + estensione array RFC-0021 § 2): una `checkbox` con tutti i
 * toggle OFF di default; se `read project` è selezionato, `sub_prompts` innesca la primitiva client
 * `project-select` (scan locale → multi-select file → contenuto impacchettato). Poi la richiesta vera.
 * La scansione e i filtri di sicurezza (mai .env/segreti) vivono nel client (`lib/project-select.ts`).
 */
export const devPromptEnhancer: Tool = {
  name: 'dev-prompt-enhancer',
  description: 'Prompt-enhancer per sviluppatori: ancora il prompt ai file reali del progetto locale.',
  prompts: [
    {
      key: 'checkbox',
      name: 'options',
      props: {
        message: 'Opzioni (spazio per selezionare, invio per continuare):',
        choices: [
          { name: 'thinking', value: 'think' },
          { name: 'read project', value: 'read-project' },
          { name: 'web search', value: 'web-search' },
        ],
        loop: false,
      },
      // Estensione array del bridge (RFC-0021 § 2): se 'read-project' è selezionato, si risolve la
      // primitiva client `project-select`. Il suo valore (bundle dei file) è compresso in HEAD se enorme.
      sub_prompts: {
        'read-project': [
          {
            key: 'project-select',
            name: 'project',
            compress: true,
            props: { message: 'Directory del progetto da scansionare:' },
          },
        ],
      },
    },
    {
      key: 'file-select',
      name: 'request',
      compress: true,
      props: { message: 'Cosa vuoi che il prompt chieda di fare?', extensions: ['.txt', '.md', '.json'] },
    },
  ],
  run: async (_WS, ctx) => {
    const { payload } = ctx;
    const options = Array.isArray(payload.options) ? (payload.options as string[]) : [];
    await runEnhancement(ctx, {
      request: String(payload.request ?? ''),
      think: options.includes('think'),
      options: {
        // Toggle esplicito: selezionato ⇒ forza ON, non selezionato ⇒ forza OFF (RFC-0021 / should_search).
        search: options.includes('web-search'),
        // Vuoto se 'read project' non era selezionato (project-select non è stato eseguito).
        projectContext: String(payload.project ?? ''),
      },
    });
  },
};
