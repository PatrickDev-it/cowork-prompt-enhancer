import { runEnhancement } from './enhance-run';
import type { Tool } from './types';

/**
 * Primo tool ad alto costo computazionale — RFC-0005, RFC-0010, RFC-0014. Fa girare sul server (la
 * macchina potente) il motore prompt-enhancer vendored (modello .gguf servito da llama-server via un
 * worker Python persistente) e consegna il prompt potenziato al client come file markdown nella
 * cartella di sessione, via ctx.fs.write (RFC-0008). Il client non sa nulla del modello.
 *
 * General-purpose: enhancement + web-search leggero automatico (RFC-0020) + deep-research opt-in
 * (RFC-0022, produce anche un report separato). Per il contesto di un progetto locale c'è invece il
 * tool verticale `dev-prompt-enhancer` (RFC-0021). Il corpo run() è condiviso (enhance-run.ts).
 */
export const promptEnhancer: Tool = {
  name: 'prompt-enhancer',
  description: 'Potenzia un prompt grezzo con un modello locale sul server e restituisce un file markdown.',
  prompts: [
    {
      key: 'file-select',
      name: 'request',
      // Input potenzialmente enorme: il runtime lo comprime in HEAD sopra soglia (RFC-0015).
      compress: true,
      props: { message: 'Quale file vuoi potenziare?', extensions: ['.txt', '.md', '.json', '.csv'] },
    },
    {
      // Toggle del reasoning del modello (RFC-0013). Default OFF: deterministico e veloce.
      key: 'confirm',
      name: 'think',
      props: { message: 'Abilitare il reasoning del modello? (più lento, a volte più accurato)', default: false },
    },
    {
      // Deep-research opt-in (RFC-0022): ricerca multi-query + report separato. Lento (multi-chiamata).
      key: 'confirm',
      name: 'deepResearch',
      props: { message: 'Deep research? (ricerca web multi-query + report separato, più lento)', default: false },
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
