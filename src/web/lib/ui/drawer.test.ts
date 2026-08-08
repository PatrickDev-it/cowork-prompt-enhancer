import { describe, expect, test } from 'bun:test';
import { shouldDismissDrawer } from './drawer';

describe('bottom drawer dismissal', () => {
  test('snaps back below the gesture threshold', () => {
    expect(shouldDismissDrawer(80, 760)).toBe(false);
  });

  test('closes a tall drawer after a bounded downward drag', () => {
    expect(shouldDismissDrawer(120, 760)).toBe(true);
  });

  test('uses a proportional threshold for a short drawer', () => {
    expect(shouldDismissDrawer(64, 400)).toBe(true);
  });
});
