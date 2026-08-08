/**
 * On-device model catalog. Sizes are the approximate download the browser actually pulls at the
 * listed quantization — stated so the cost of a choice is visible *before* it is paid, not
 * discovered as a stalled progress bar. Every entry is a transformers.js-compatible repo.
 */

export interface LocalModelChoice {
  modelId: string;
  label: string;
  /** Approximate download, human-readable. */
  size: string;
  note: string;
  dtype: 'q4' | 'q4f16' | 'q8';
  device: 'webgpu' | 'wasm';
}

export interface LocalModelPreset extends LocalModelChoice {
  id: string;
}

/** Ordered smallest-first so the list reads as a capability ladder. */
export const LOCAL_MODEL_PRESETS: LocalModelPreset[] = [
  {
    id: 'smollm2-360m',
    modelId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M',
    size: '~180 MB',
    note: 'Default. The conservative on-device path for browsers with an unknown memory budget.',
    dtype: 'q8',
    device: 'wasm',
  },
  {
    id: 'smollm2-1.7b',
    modelId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    label: 'SmolLM2 1.7B',
    size: '~1.0 GB',
    note: 'Higher-quality WebGPU option. Select it deliberately after confirming this browser has headroom.',
    dtype: 'q4',
    device: 'webgpu',
  },
  {
    id: 'llama-3.2-1b',
    modelId: 'onnx-community/Llama-3.2-1B-Instruct',
    label: 'Llama 3.2 1B',
    size: '~0.8 GB',
    note: 'Alternative to SmolLM2 at a similar footprint.',
    dtype: 'q4',
    device: 'webgpu',
  },
  {
    id: 'qwen2.5-1.5b',
    modelId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: 'Qwen2.5 1.5B',
    size: '~1.0 GB',
    note: 'Same family as the workstation profile’s 8B model.',
    dtype: 'q4',
    device: 'webgpu',
  },
  {
    id: 'phi-3.5-mini',
    modelId: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    label: 'Phi-3.5 mini 3.8B',
    size: '~2.5 GB',
    note: 'Strongest on-device option. Needs a capable GPU and patience on first load.',
    dtype: 'q4f16',
    device: 'webgpu',
  },
];

/** Fresh browsers start on the small, conservative tier. Larger WebGPU models are opt-in. */
export const DEFAULT_PRESET_ID = 'smollm2-360m';

/** Fallback for a device that reports little memory or no WebGPU adapter. */
export const LIGHT_PRESET_ID = 'smollm2-360m';

export function presetById(id: string): LocalModelPreset | undefined {
  return LOCAL_MODEL_PRESETS.find((preset) => preset.id === id);
}

/** Any transformers.js-compatible repo the user pastes in. Assumes WebGPU + q4, which is the
 * combination the published ONNX community exports are built for; a wrong guess surfaces as a
 * typed `engine_download` rather than a silent hang. */
export function customChoice(modelId: string): LocalModelChoice {
  return {
    modelId,
    label: modelId.split('/').pop() ?? modelId,
    size: 'unknown',
    note: 'Custom model.',
    dtype: 'q4',
    device: 'webgpu',
  };
}

/** Default model IDs for the API tier. Only Anthropic is pinned — its current model is known
 * (`claude-opus-5`); for the others the settings panel populates the list from the provider's own
 * models endpoint, so no stale identifier is ever hardcoded here. */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';
