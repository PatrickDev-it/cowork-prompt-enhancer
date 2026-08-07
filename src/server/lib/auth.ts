import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ErrorCode } from '../../protocol';

export interface SessionChallenge {
  id: string;
  nonce: string;
  expiresAt: number;
}

export type ChallengeVerification = { ok: true } | { ok: false; code: ErrorCode };

export function challengeMessage(challenge: SessionChallenge, clientId: string): string {
  return `${challenge.id}:${challenge.nonce}:${challenge.expiresAt}:${clientId}`;
}

export function createChallengeProof(secret: string, challenge: SessionChallenge, clientId: string): string {
  return createHmac('sha256', secret).update(challengeMessage(challenge, clientId)).digest('hex');
}

export class ChallengeStore {
  private readonly pending = new Map<string, SessionChallenge>();
  private readonly used = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly ttlMs = 30_000,
    private readonly maxEntries = 1_024,
    private readonly now: () => number = Date.now
  ) {}

  issue(): SessionChallenge {
    this.sweep();
    while (this.pending.size >= this.maxEntries) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
    }
    const challenge = {
      id: randomBytes(16).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      expiresAt: this.now() + this.ttlMs,
    };
    this.pending.set(challenge.id, challenge);
    return challenge;
  }

  verify(id: string, clientId: string, proof: string): ChallengeVerification {
    this.sweep();
    if (this.used.has(id)) return { ok: false, code: 'challenge_replayed' };
    const challenge = this.pending.get(id);
    if (!challenge) return { ok: false, code: 'authentication_failed' };
    this.pending.delete(id);
    while (this.used.size >= this.maxEntries) {
      const oldest = this.used.keys().next().value as string | undefined;
      if (!oldest) break;
      this.used.delete(oldest);
    }
    this.used.set(id, challenge.expiresAt + this.ttlMs);
    if (challenge.expiresAt < this.now()) return { ok: false, code: 'challenge_expired' };

    const expected = Buffer.from(createChallengeProof(this.secret, challenge, clientId), 'hex');
    const presented = /^[a-f0-9]{64}$/i.test(proof) ? Buffer.from(proof, 'hex') : Buffer.alloc(32);
    return timingSafeEqual(expected, presented) ? { ok: true } : { ok: false, code: 'authentication_failed' };
  }

  private sweep(): void {
    const current = this.now();
    for (const [id, challenge] of this.pending) {
      if (challenge.expiresAt + this.ttlMs < current) this.pending.delete(id);
    }
    for (const [id, expiresAt] of this.used) {
      if (expiresAt < current) this.used.delete(id);
    }
  }
}
