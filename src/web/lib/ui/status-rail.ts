import type { EngineInfo, EngineProgress } from '../engine/types';

export type RailState = 'idle' | 'busy' | 'ready' | 'error';

/**
 * The persistent runtime rail: what engine is active, what it is doing, and how far along a
 * determinate download is. It exists because the old UI had a single status string that went
 * silent for minutes during a multi-hundred-megabyte model fetch.
 */
export class StatusRail {
  constructor(
    private readonly root: HTMLElement,
    private readonly statusEl: HTMLElement,
    private readonly engineEl: HTMLElement,
    private readonly progressEl: HTMLElement,
    private readonly onStateChange?: (state: RailState, message: string) => void
  ) {}

  set(state: RailState, message: string): void {
    this.root.dataset.state = state;
    this.statusEl.textContent = message;
    this.onStateChange?.(state, message);
    if (state !== 'busy') this.setProgress(null);
  }

  /** `null` hides the hairline; a number 0–100 draws it. */
  setProgress(percent: number | null): void {
    this.progressEl.style.width = percent === null ? '0' : `${Math.max(0, Math.min(100, percent))}%`;
  }

  reportProgress(event: EngineProgress): void {
    if (event.status === 'progress' && typeof event.progress === 'number') {
      const file = event.file ? ` ${event.file}` : '';
      this.set('busy', `Downloading${file} · ${Math.round(event.progress)}%`);
      this.setProgress(event.progress);
      return;
    }
    if (event.status === 'ready') {
      this.set('busy', event.message ?? 'Model ready');
      return;
    }
    if (event.status === 'done') return;
    this.set('busy', event.message ?? event.status);
  }

  setEngine(info: EngineInfo): void {
    const privacy = info.onDevice ? 'on device' : 'via API key';
    this.engineEl.textContent = `${info.modelId} · ${privacy}`;
    this.engineEl.className = info.onDevice ? 'rail-item rail-badge' : 'rail-item';
  }
}
