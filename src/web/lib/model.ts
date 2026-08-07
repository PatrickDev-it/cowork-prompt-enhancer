import { AutoModelForCausalLM, AutoTokenizer, TextStreamer } from '@huggingface/transformers';
import type { ModelTier } from './capability';

const MODEL_BY_TIER: Record<ModelTier, string> = {
  default: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
  light: 'HuggingFaceTB/SmolLM2-360M-Instruct',
};

const MAX_NEW_TOKENS = 768;

export interface ModelProgress {
  status: string;
  file?: string;
  progress?: number;
}

export interface LoadedModel {
  tier: ModelTier;
  modelId: string;
  generate: (prompt: string, onToken: (token: string) => void) => Promise<string>;
}

let cached: LoadedModel | null = null;

/** Loads the tiered model directly from the Hugging Face CDN (ADR-001 — never bundled, never
 * committed to this repo) and caches it in the browser's own cache storage for later visits.
 * Resolves once ready; download/compile progress is reported through `onProgress`. */
export async function loadModel(tier: ModelTier, onProgress: (event: ModelProgress) => void): Promise<LoadedModel> {
  if (cached && cached.tier === tier) return cached;

  const modelId = MODEL_BY_TIER[tier];
  const device = tier === 'default' ? 'webgpu' : 'wasm';
  const dtype = tier === 'default' ? 'q4' : 'q8';

  const tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback: onProgress });
  const model = await AutoModelForCausalLM.from_pretrained(modelId, {
    dtype,
    device,
    progress_callback: onProgress,
  });

  const generate = async (prompt: string, onToken: (token: string) => void): Promise<string> => {
    const messages: [{ role: 'user'; content: string }] = [{ role: 'user', content: prompt }];
    const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true });

    let full = '';
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token: string) => {
        full += token;
        onToken(token);
      },
    });

    await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      do_sample: false,
      streamer,
    });

    return full;
  };

  cached = { tier, modelId, generate };
  return cached;
}
