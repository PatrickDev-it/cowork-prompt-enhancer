import { ANTHROPIC_DEFAULT_MODEL, DEFAULT_PRESET_ID, LIGHT_PRESET_ID } from './models';

/**
 * Settings persistence. API keys live in `localStorage` and nowhere else: they are sent only to
 * the provider the user chose, and there is no server of ours to send them to. That is a real
 * trade-off rather than a free one — a key here is readable by anyone with access to the device
 * or by any script that runs on this origin — and the settings panel states it rather than
 * implying browser BYOK is risk-free.
 */

export type EngineKind = 'local' | 'anthropic' | 'openai' | 'gemini';
export type ApiProvider = Exclude<EngineKind, 'local'>;

export interface Settings {
  engine: EngineKind;
  /** Preset id, or `custom` when `customModelId` carries a pasted repo. */
  localPreset: string;
  customModelId: string;
  keys: Record<ApiProvider, string>;
  models: Record<ApiProvider, string>;
  /** Bumps when a persisted default must be made safer for existing browsers. */
  memoryPolicyVersion: 2;
}

const STORAGE_KEY = 'ai-prompt-optimizer/settings/v1';

export function defaultSettings(): Settings {
  return {
    engine: 'local',
    localPreset: DEFAULT_PRESET_ID,
    customModelId: '',
    keys: { anthropic: '', openai: '', gemini: '' },
    models: { anthropic: ANTHROPIC_DEFAULT_MODEL, openai: '', gemini: '' },
    memoryPolicyVersion: 2,
  };
}

function isEngineKind(value: unknown): value is EngineKind {
  return value === 'local' || value === 'anthropic' || value === 'openai' || value === 'gemini';
}

function readStringMap<K extends string>(
  source: unknown,
  keys: readonly K[],
  fallback: Record<K, string>
): Record<K, string> {
  const result = { ...fallback };
  if (typeof source !== 'object' || source === null) return result;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

const API_PROVIDERS: readonly ApiProvider[] = ['anthropic', 'openai', 'gemini'];

/** Never throws: a corrupt or foreign payload degrades to defaults rather than breaking boot. */
export function loadSettings(): Settings {
  const fallback = defaultSettings();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback; // storage disabled (private mode, blocked cookies)
  }
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const storedPreset = typeof parsed.localPreset === 'string' ? parsed.localPreset : fallback.localPreset;
    // v1 had no way to distinguish a manual 1.7B choice from its automatic default. Resetting
    // that one legacy value is the only safe migration; users can opt back in from Settings.
    const isCurrentMemoryPolicy = parsed.memoryPolicyVersion === 2;
    return {
      engine: isEngineKind(parsed.engine) ? parsed.engine : fallback.engine,
      localPreset: !isCurrentMemoryPolicy && storedPreset === 'smollm2-1.7b' ? LIGHT_PRESET_ID : storedPreset,
      customModelId: typeof parsed.customModelId === 'string' ? parsed.customModelId : fallback.customModelId,
      keys: readStringMap(parsed.keys, API_PROVIDERS, fallback.keys),
      models: readStringMap(parsed.models, API_PROVIDERS, fallback.models),
      memoryPolicyVersion: 2,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — the session still works, it just will not be remembered.
  }
}

/** Clears every stored credential. Offered as an explicit affordance, not buried in devtools. */
export function clearStoredKeys(settings: Settings): Settings {
  const cleared: Settings = { ...settings, keys: { anthropic: '', openai: '', gemini: '' } };
  saveSettings(cleared);
  return cleared;
}

/** Whether the chosen engine has everything it needs to run. */
export function isEngineReady(settings: Settings): boolean {
  if (settings.engine === 'local') return settings.localPreset !== 'custom' || Boolean(settings.customModelId);
  return Boolean(settings.keys[settings.engine] && settings.models[settings.engine]);
}
