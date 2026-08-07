export interface RequestTrace {
  schedulerQueueMs: number;
  providerQueueMs: number;
  compressionMs: number;
  generationMs: number;
  providerMs: number;
  artifactMs: number;
  totalMs: number;
  compressedFields: number;
  compressionInputTokens: number;
  compressionOutputTokens: number;
  providerCalls: number;
  promptTokens: number;
  completionTokens: number;
  generationMode: string;
  fallbackUsed: boolean;
  grounded: boolean;
  artifacts: string[];
}

export interface RequestTraceRecord {
  correlationId: string;
  tool: string;
  outcome: 'success' | 'error';
  trace: RequestTrace;
}

export function createRequestTrace(): RequestTrace {
  return {
    schedulerQueueMs: 0,
    providerQueueMs: 0,
    compressionMs: 0,
    generationMs: 0,
    providerMs: 0,
    artifactMs: 0,
    totalMs: 0,
    compressedFields: 0,
    compressionInputTokens: 0,
    compressionOutputTokens: 0,
    providerCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    generationMode: 'not_applicable',
    fallbackUsed: false,
    grounded: false,
    artifacts: [],
  };
}

/** Bounded in-memory metrics for the opt-in loopback endpoint. No prompts or credentials are retained. */
export class MetricsRegistry {
  private readonly recent: RequestTraceRecord[] = [];
  private total = 0;
  private failed = 0;
  private fallbacks = 0;

  constructor(private readonly capacity = 100) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('metrics capacity must be positive');
  }

  record(value: RequestTraceRecord): void {
    const record = structuredClone(value);
    this.total += 1;
    if (record.outcome === 'error') this.failed += 1;
    if (record.trace.fallbackUsed) this.fallbacks += 1;
    this.recent.push(record);
    if (this.recent.length > this.capacity) this.recent.shift();
  }

  snapshot(scheduler: { active: number; queued: number }): object {
    return {
      schemaVersion: 1,
      totals: { requests: this.total, failed: this.failed, fallbacks: this.fallbacks },
      scheduler,
      recent: structuredClone(this.recent),
    };
  }
}

export const requestMetrics = new MetricsRegistry();
