const DISMISS_RATIO = 0.16;
const MAX_DISMISS_DISTANCE = 120;

/** A short sheet needs a proportional gesture; a tall sheet never requires more than 120 px. */
export function shouldDismissDrawer(offset: number, height: number): boolean {
  return Math.max(0, offset) >= Math.min(MAX_DISMISS_DISTANCE, Math.max(0, height) * DISMISS_RATIO);
}
