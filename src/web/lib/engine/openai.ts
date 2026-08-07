import OpenAI from 'openai';
import {
  classifyApiError,
  type CompileHandlers,
  type Engine,
  EngineError,
  type EngineInfo,
  SPEC_JSON_SCHEMA,
} from './types';

const MAX_TOKENS = 4096;

export class OpenAiEngine implements Engine {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string
  ) {
    if (!apiKey) throw new EngineError('engine_configuration', 'An OpenAI API key is required.');
    if (!modelId) throw new EngineError('engine_configuration', 'Select an OpenAI model.');
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  info(): EngineInfo {
    return { kind: 'openai', label: 'OpenAI', modelId: this.modelId, onDevice: false };
  }

  async compile(prompt: string, handlers: CompileHandlers = {}): Promise<string> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.modelId,
          max_completion_tokens: MAX_TOKENS,
          stream: true,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'compiled_spec', strict: true, schema: SPEC_JSON_SCHEMA },
          },
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: handlers.signal }
      );

      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        full += delta;
        handlers.onToken?.(delta);
      }
      return full;
    } catch (error) {
      throw classifyApiError(error, this.apiKey);
    }
  }
}

export async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const ids: string[] = [];
    for await (const model of client.models.list()) ids.push(model.id);
    // The account list includes embeddings, audio and image models; a chat-shaped filter keeps
    // the picker usable without hardcoding a specific generation's identifiers.
    const chatLike = ids.filter(
      (id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/embed|whisper|tts|dall|image|audio/i.test(id)
    );
    return (chatLike.length > 0 ? chatLike : ids).sort();
  } catch (error) {
    throw classifyApiError(error, apiKey);
  }
}
