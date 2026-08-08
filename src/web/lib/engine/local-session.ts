export interface DisposableModelSession {
  dispose?: () => unknown;
}

/**
 * ORT/WebGPU resources are not governed by JavaScript garbage collection timing. Dispose is
 * deliberately best-effort: a lost device must not block a safer replacement or leave cache
 * ownership ambiguous.
 */
export async function disposeModelSession(model: DisposableModelSession | null | undefined): Promise<void> {
  try {
    await model?.dispose?.();
  } catch {
    // The caller clears its cache reference before disposal; a device-lost cleanup is non-fatal.
  }
}
