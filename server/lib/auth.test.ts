import { describe, expect, test } from 'bun:test';
import { ChallengeStore, createChallengeProof } from './auth';

describe('remote session challenges', () => {
  test('accepts one valid proof and rejects replay', () => {
    let now = 1_000;
    const secret = 'a'.repeat(32);
    const store = new ChallengeStore(secret, 30_000, 10, () => now);
    const challenge = store.issue();
    const proof = createChallengeProof(secret, challenge, 'client-1');
    expect(store.verify(challenge.id, 'client-1', proof)).toEqual({ ok: true });
    expect(store.verify(challenge.id, 'client-1', proof)).toEqual({ ok: false, code: 'challenge_replayed' });
    now += 1;
  });

  test('rejects invalid credentials and expired challenges without exposing the secret', () => {
    let now = 5_000;
    const secret = 'confidential-session-secret-123456';
    const store = new ChallengeStore(secret, 100, 10, () => now);
    const invalid = store.issue();
    expect(store.verify(invalid.id, 'client-1', 'bad')).toEqual({ ok: false, code: 'authentication_failed' });
    const expired = store.issue();
    now = expired.expiresAt + 1;
    const result = store.verify(expired.id, 'client-1', createChallengeProof(secret, expired, 'client-1'));
    expect(result).toEqual({ ok: false, code: 'challenge_expired' });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
