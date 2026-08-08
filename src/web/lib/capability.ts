export type ModelTier = 'default' | 'light';

export interface Capability {
  webgpu: boolean;
  deviceMemoryGB: number | null;
  tier: ModelTier;
}

interface NavigatorWithExtras extends Navigator {
  gpu?: { requestAdapter: () => Promise<unknown> };
  deviceMemory?: number;
}

const MIN_CONFIRMED_WEBGPU_MEMORY_GB = 8;

/**
 * `deviceMemory` is absent on several browsers. Absence means "unknown", not "enough": only a
 * measured browser with a substantial budget can be classified as WebGPU-capable. The fresh
 * settings default remains light regardless; this tier prevents legacy GPU selections from being
 * retained on a browser that cannot establish a safe budget.
 */
export function selectModelTier(webgpu: boolean, deviceMemoryGB: number | null): ModelTier {
  if (!webgpu || deviceMemoryGB === null || deviceMemoryGB < MIN_CONFIRMED_WEBGPU_MEMORY_GB) return 'light';
  return 'default';
}

/**
 * Probes WebGPU availability and reported device memory to pick a model tier before any
 * download starts. There is no static "unsupported" verdict here: a missing/failing WebGPU
 * adapter still gets the light tier over transformers.js's WASM backend, and true
 * unsupportedness only surfaces as a load error from model.ts, which the UI reports directly.
 */
export async function detectCapability(): Promise<Capability> {
  const nav = navigator as NavigatorWithExtras;
  const webgpu = await probeWebGpuAdapter(nav);
  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;

  const tier = selectModelTier(webgpu, deviceMemoryGB);

  return { webgpu, deviceMemoryGB, tier };
}

async function probeWebGpuAdapter(nav: NavigatorWithExtras): Promise<boolean> {
  if (!nav.gpu) return false;
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}
