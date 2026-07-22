import { type EnhanceOptions, enhancePrompt } from '@/modules/prompt_enhancer';
import type { ToolContext } from './types';

/**
 * Shared delivery path for both prompt-enhancer tools (RFC-0021). Every run writes a timestamped
 * prompt artifact; opt-in deep research may add a separate timestamped research artifact.
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
  if (!raw) throw new Error('The request is empty; nothing can be compiled.');

  const flags = [
    `reasoning ${think ? 'ON' : 'OFF'}`,
    options.deepResearch ? 'deep-research ON' : null,
    options.projectContext ? 'project-context ON' : null,
  ]
    .filter(Boolean)
    .join(', ');
  ctx.status({ sub_event: 'start', message: `Compiling request (${flags}, persistent worker)...` });

  const { prompt, research, trace } = await enhancePrompt(
    raw,
    'production-grade',
    think,
    (message) => ctx.status({ sub_event: 'log', message }),
    { ...options, signal: ctx.signal, correlationId: ctx.correlationId }
  );
  ctx.trace.providerQueueMs = trace.providerQueueMs;
  ctx.trace.generationMs = trace.generationMs;
  ctx.trace.providerMs = trace.providerMs;
  ctx.trace.providerCalls = trace.providerCalls;
  ctx.trace.promptTokens = trace.promptTokens;
  ctx.trace.completionTokens = trace.completionTokens;
  ctx.trace.generationMode = trace.generationMode;
  ctx.trace.fallbackUsed = trace.fallbackUsed;
  ctx.trace.grounded = trace.grounded;

  ctx.status({ sub_event: 'progress', percent: 95, message: 'Compilation complete; delivering artifacts...' });

  const artifactStartedAt = performance.now();
  const delivered: string[] = [];
  if (research?.trim()) {
    const researchFile = sessionFilename('research');
    ctx.fs.write(researchFile, research);
    delivered.push(researchFile);
  }
  const promptFile = sessionFilename('prompt');
  ctx.fs.write(promptFile, prompt);
  delivered.push(promptFile);
  ctx.trace.artifactMs = performance.now() - artifactStartedAt;
  ctx.trace.artifacts = delivered;

  ctx.status({ sub_event: 'done', message: `Delivered: ${delivered.join(', ')}` });
}
