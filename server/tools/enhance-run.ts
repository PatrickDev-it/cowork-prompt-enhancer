import { type EnhanceOptions, enhancePrompt } from '@/modules/prompt_enhancer';
import type { ToolContext } from './types';

/**
 * Corpo `run()` condiviso dai tool basati sul prompt-enhancer — RFC-0021 § 5. `prompt-enhancer`
 * (generale) e `dev-prompt-enhancer` (verticale) differiscono solo negli input assemblati: l'atto
 * finale — chiamare il modulo e consegnare il/i file in sessione (RFC-0008) — è identico e vive qui,
 * così i due tool non divergono in logica di dominio.
 *
 * Consegna: sempre `prompt_<ts>.md`; se il deep-research (RFC-0022) ha prodotto un report, anche
 * `research_<ts>.md`. La cartella di sessione è condivisa da tutte le invocazioni (RFC-0008 § 1),
 * quindi il nome porta un timestamp al millisecondo per unicità (come il tool storico).
 */

function sessionFilename(prefix: string): string {
  const stamp = new Date().toISOString().replace('T', '_').replaceAll(':', '-').replace('Z', '').replace('.', '-');
  return `${prefix}_${stamp}.md`;
}

export interface EnhanceRunArgs {
  request: string;
  think: boolean;
  options?: EnhanceOptions;
}

export async function runEnhancement(
  ctx: ToolContext,
  { request, think, options = {} }: EnhanceRunArgs
): Promise<void> {
  const raw = request.trim();
  if (!raw) throw new Error('Prompt vuoto: niente da potenziare.');

  const flags = [
    `reasoning ${think ? 'ON' : 'OFF'}`,
    options.deepResearch ? 'deep-research ON' : null,
    options.projectContext ? 'project-context ON' : null,
  ]
    .filter(Boolean)
    .join(', ');
  ctx.status({ sub_event: 'start', message: `Invio al motore locale (${flags}, worker persistente)...` });

  const { prompt, research } = await enhancePrompt(
    raw,
    'production-grade',
    think,
    (message) => ctx.status({ sub_event: 'log', message }),
    options
  );

  ctx.status({ sub_event: 'progress', percent: 95, message: 'Generato, consegna al client...' });

  const delivered: string[] = [];
  if (research?.trim()) {
    const researchFile = sessionFilename('research');
    ctx.fs.write(researchFile, research);
    delivered.push(researchFile);
  }
  const promptFile = sessionFilename('prompt');
  ctx.fs.write(promptFile, prompt);
  delivered.push(promptFile);

  ctx.status({ sub_event: 'done', message: `Consegnato: ${delivered.join(', ')}` });
}
