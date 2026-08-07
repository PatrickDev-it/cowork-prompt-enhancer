import type { LocalModelChoice } from '../models';
import type { Settings } from '../settings';
import { LocalEngine } from './local';
import { type Engine, EngineError } from './types';

export * from './types';

/**
 * Builds the engine for the current settings. Each API provider's SDK is behind a dynamic
 * `import()` so selecting "on device" — the default, and the only tier most visitors use — never
 * downloads three vendor SDKs it will not call.
 */
export async function createEngine(settings: Settings, localChoice: LocalModelChoice): Promise<Engine> {
  switch (settings.engine) {
    case 'local':
      return new LocalEngine(localChoice);

    case 'anthropic': {
      const { AnthropicEngine } = await import('./anthropic');
      return new AnthropicEngine(settings.keys.anthropic, settings.models.anthropic);
    }

    case 'openai': {
      const { OpenAiEngine } = await import('./openai');
      return new OpenAiEngine(settings.keys.openai, settings.models.openai);
    }

    case 'gemini': {
      const { GeminiEngine } = await import('./gemini');
      return new GeminiEngine(settings.keys.gemini, settings.models.gemini);
    }

    default:
      throw new EngineError('engine_configuration', `Unknown engine "${settings.engine as string}".`);
  }
}

/** Model-list lookup for the settings panel, same dynamic-import discipline. */
export async function listModels(provider: 'anthropic' | 'openai' | 'gemini', apiKey: string): Promise<string[]> {
  if (!apiKey) throw new EngineError('engine_configuration', 'Enter an API key first.');
  if (provider === 'anthropic') return (await import('./anthropic')).listAnthropicModels(apiKey);
  if (provider === 'openai') return (await import('./openai')).listOpenAiModels(apiKey);
  return (await import('./gemini')).listGeminiModels(apiKey);
}
