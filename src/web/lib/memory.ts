export type MemorySource = 'agent' | 'js-heap';

export interface BrowserMemorySnapshot {
  bytes: number;
  source: MemorySource;
}

export interface BrowserMemoryPerformance {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  memory?: { usedJSHeapSize: number };
}

/**
 * Browser memory is intentionally best-effort. The isolated agent measurement is broader than
 * the JS heap; Safari-family browsers may expose neither. Returning null is more honest than
 * displaying a made-up GPU/RAM number.
 */
export async function measureBrowserMemory(
  browserPerformance: BrowserMemoryPerformance = window.performance as BrowserMemoryPerformance
): Promise<BrowserMemorySnapshot | null> {
  try {
    if (browserPerformance.measureUserAgentSpecificMemory) {
      const { bytes } = await browserPerformance.measureUserAgentSpecificMemory();
      if (Number.isFinite(bytes) && bytes >= 0) return { bytes, source: 'agent' };
    }
  } catch {
    // The API is permission- and browser-dependent; the heap fallback below is still useful.
  }

  const bytes = browserPerformance.memory?.usedJSHeapSize;
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? { bytes, source: 'js-heap' } : null;
}

export function formatMemory(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

export function memoryDescription(snapshot: BrowserMemorySnapshot | null): string {
  if (!snapshot) return 'browser memory telemetry unavailable';
  const scope = snapshot.source === 'agent' ? 'browser memory' : 'JavaScript heap';
  return `${scope} ${formatMemory(snapshot.bytes)}`;
}
