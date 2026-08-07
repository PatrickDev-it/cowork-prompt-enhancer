import { AutoModelForCausalLM, AutoTokenizer, TextStreamer } from '@huggingface/transformers';
import type { LocalModelChoice } from '../models';
import { type CompileHandlers, type Engine, EngineError, type EngineInfo } from './types';

const MAX_NEW_TOKENS = 768;

interface CachedModel {
  modelId: string;
  dtype: string;
  device: string;
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
}

/** One model stays resident; switching models in the picker evicts it. Loading is expensive
 * enough (a multi-hundred-MB download plus WebGPU compile) that re-entering the same choice must
 * never re-pay it. */
let cached: CachedModel | null = null;

/**
 * On-device engine: weights come from the Hugging Face CDN straight into this browser and are
 * cached there (ADR-001 — never bundled, never committed). No request carries user text.
 */
export class LocalEngine implements Engine {
  constructor(private readonly choice: LocalModelChoice) {}

  info(): EngineInfo {
    return {
      kind: 'local',
      label: this.choice.label,
      modelId: this.choice.modelId,
      onDevice: true,
    };
  }

  async compile(prompt: string, handlers: CompileHandlers = {}): Promise<string> {
    const { tokenizer, model } = await this.load(handlers);

    const messages: [{ role: 'user'; content: string }] = [{ role: 'user', content: prompt }];
    const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true });

    let full = '';
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token: string) => {
        full += token;
        handlers.onToken?.(token);
      },
    });

    try {
      await model.generate({
        ...inputs,
        max_new_tokens: handlers.maxTokens ?? MAX_NEW_TOKENS,
        do_sample: false,
        streamer,
      });
    } catch (error) {
      throw new EngineError('engine_error', 'Generation failed on this device.', { cause: error });
    }

    return full;
  }

  private async load(handlers: CompileHandlers): Promise<CachedModel> {
    const { modelId, dtype, device } = this.choice;
    if (cached && cached.modelId === modelId && cached.dtype === dtype && cached.device === device) {
      return cached;
    }
    cached = null;

    const progress_callback = handlers.onProgress
      ? (event: unknown) => handlers.onProgress?.(event as never)
      : undefined;

    try {
      const tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });
      const model = await AutoModelForCausalLM.from_pretrained(modelId, { dtype, device, progress_callback });
      cached = { modelId, dtype, device, tokenizer, model };
      return cached;
    } catch (error) {
      // A load failure is either "this browser can't" or "that repo isn't loadable" — both are
      // recoverable by the user, and conflating them into one message was the old UI's worst flaw.
      const detail = error instanceof Error ? error.message : String(error);
      if (/webgpu|adapter|device/i.test(detail)) {
        throw new EngineError('engine_unsupported', 'This browser could not initialise WebGPU for that model.', {
          cause: error,
        });
      }
      throw new EngineError('engine_download', `Could not load "${modelId}". Check the model ID and your connection.`, {
        cause: error,
      });
    }
  }
}
