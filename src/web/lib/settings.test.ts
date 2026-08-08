import { describe, expect, test } from 'bun:test';
import { LIGHT_PRESET_ID } from './models';
import { defaultSettings, isEngineReady } from './settings';

describe('browser defaults', () => {
  test('starts a fresh browser on the conservative local model', () => {
    expect(defaultSettings().localPreset).toBe(LIGHT_PRESET_ID);
  });

  test('requires a repository id before a custom local model is ready', () => {
    const settings = { ...defaultSettings(), localPreset: 'custom' };
    expect(isEngineReady(settings)).toBe(false);
    expect(isEngineReady({ ...settings, customModelId: 'onnx-community/custom-model' })).toBe(true);
  });
});
