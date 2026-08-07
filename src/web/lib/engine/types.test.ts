import { describe, expect, test } from 'bun:test';
import { classifyApiError, EngineError, redactSecret, SPEC_JSON_SCHEMA } from './types';

/** Deliberately not shaped like any vendor's real key prefix: this file is public, and a
 * realistic-looking fixture trips automated secret scanners for no benefit. Redaction only cares
 * that the value is long enough to clear the minimum-length guard. */
const KEY = 'fixture-not-a-real-credential-0001';

describe('redactSecret', () => {
  test('removes every occurrence of the key', () => {
    const text = `request failed for ${KEY} using ${KEY}`;
    const clean = redactSecret(text, KEY);
    expect(clean).not.toContain(KEY);
    expect(clean).toBe('request failed for [redacted] using [redacted]');
  });

  test('leaves text untouched when there is no key', () => {
    expect(redactSecret('nothing to hide', null)).toBe('nothing to hide');
    expect(redactSecret('nothing to hide', '')).toBe('nothing to hide');
  });

  test('ignores implausibly short secrets rather than shredding ordinary text', () => {
    expect(redactSecret('a stateless request', 'a')).toBe('a stateless request');
  });
});

describe('classifyApiError', () => {
  const err = (status: number, message = 'boom') => Object.assign(new Error(message), { status });

  test('maps auth failures', () => {
    expect(classifyApiError(err(401)).code).toBe('engine_auth');
    expect(classifyApiError(err(403)).code).toBe('engine_auth');
  });

  test('maps rate limiting', () => {
    expect(classifyApiError(err(429)).code).toBe('engine_rate_limit');
  });

  test('separates context overflow from other bad requests by message, not status alone', () => {
    expect(classifyApiError(err(400, 'prompt is too long for this model')).code).toBe('engine_context_overflow');
    expect(classifyApiError(err(400, 'unknown parameter foo')).code).toBe('engine_error');
  });

  test('passes an existing EngineError straight through', () => {
    const original = new EngineError('engine_download', 'nope');
    expect(classifyApiError(original)).toBe(original);
  });

  test('never lets the key reach the message', () => {
    const classified = classifyApiError(err(400, `bad request with key ${KEY}`), KEY);
    expect(classified.message).not.toContain(KEY);
    expect(classified.message).toContain('[redacted]');
  });

  test('truncates long provider detail', () => {
    const classified = classifyApiError(err(500, 'x'.repeat(1000)));
    expect(classified.message.length).toBeLessThanOrEqual(300);
  });

  test('handles non-Error throwables', () => {
    expect(classifyApiError('plain string failure').code).toBe('engine_error');
  });
});

describe('SPEC_JSON_SCHEMA', () => {
  test('requires all ten spec fields and forbids extras', () => {
    expect(SPEC_JSON_SCHEMA.required).toHaveLength(10);
    expect(SPEC_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(SPEC_JSON_SCHEMA.properties)).toEqual([...SPEC_JSON_SCHEMA.required]);
  });
});
