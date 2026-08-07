import Anthropic from '@anthropic-ai/sdk';
import {
  classifyApiError,
  type CompileHandlers,
  type Engine,
  EngineError,
  type EngineInfo,
  schemaForFields,
  SPEC_JSON_SCHEMA,
} from './types';

/** The compiled envelope runs ~1.5k tokens. Bounded deliberately rather than left generous:
 * the output is a fixed-shape specification, not open-ended prose. */
const MAX_TOKENS = 4096;

export class AnthropicEngine implements Engine {
  private readonly client: Anthropic;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string
  ) {
    if (!apiKey) throw new EngineError('engine_configuration', 'An Anthropic API key is required.');
    this.client = new Anthropic({
      apiKey,
      // Required for browser use, and named to be alarming: the key lives in this page and is
      // readable by anything with access to it. The settings panel states that plainly.
      dangerouslyAllowBrowser: true,
    });
  }

  info(): EngineInfo {
    return { kind: 'anthropic', label: 'Anthropic', modelId: this.modelId, onDevice: false };
  }

  async compile(prompt: string, handlers: CompileHandlers = {}): Promise<string> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.modelId,
          max_tokens: handlers.maxTokens ?? MAX_TOKENS,
          // Adaptive rather than disabled: on current models, disabling thinking is what causes
          // stray `<thinking>` text to leak into the visible response. Low effort keeps a
          // structured-extraction task cheap and fast without that failure mode.
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'low',
            format: {
              type: 'json_schema',
              schema: handlers.fields ? schemaForFields(handlers.fields) : SPEC_JSON_SCHEMA,
            },
          },
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: handlers.signal }
      );

      stream.on('text', (delta) => handlers.onToken?.(delta));

      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') {
        throw new EngineError('engine_error', 'The provider declined this request.');
      }
      return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    } catch (error) {
      throw classifyApiError(error, this.apiKey);
    }
  }
}

/** Reads the caller's own model list instead of shipping identifiers that go stale. */
export async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const ids: string[] = [];
    for await (const model of client.models.list()) ids.push(model.id);
    return ids;
  } catch (error) {
    throw classifyApiError(error, apiKey);
  }
}
