export class CommandReplayCache {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxEntries = 4_096,
    private readonly now: () => number = Date.now
  ) {}

  accept(clientId: string, commandId: string): boolean {
    this.sweep();
    const key = `${clientId}:${commandId}`;
    if (this.seen.has(key)) return false;
    while (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.keys().next().value as string | undefined;
      if (!oldest) break;
      this.seen.delete(oldest);
    }
    this.seen.set(key, this.now() + this.ttlMs);
    return true;
  }

  private sweep(): void {
    const current = this.now();
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt < current) this.seen.delete(key);
    }
  }
}
