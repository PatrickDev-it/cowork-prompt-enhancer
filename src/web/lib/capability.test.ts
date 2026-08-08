import { describe, expect, test } from 'bun:test';
import { selectModelTier } from './capability';

describe('safe browser capability policy', () => {
  test('keeps an unknown-memory browser on the light tier', () => {
    expect(selectModelTier(true, null)).toBe('light');
  });

  test('does not treat a missing WebGPU adapter as a reason to select a GPU model', () => {
    expect(selectModelTier(false, 16)).toBe('light');
  });

  test('recognises a measured, capable browser without changing the conservative default', () => {
    expect(selectModelTier(true, 16)).toBe('default');
  });
});
