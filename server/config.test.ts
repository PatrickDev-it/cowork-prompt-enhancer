import { describe, expect, test } from 'bun:test';
import { assertValidConfig, resolveProviderProfile } from './config';

describe('provider profile configuration', () => {
  test('defaults to deterministic mock', () => {
    expect(resolveProviderProfile({})).toBe('mock');
    expect(() => assertValidConfig({})).not.toThrow();
  });

  test('maps the one-release provider aliases', () => {
    expect(resolveProviderProfile({ COWORK_PROMPT_ENHANCER_PROVIDER: 'llama_server' })).toBe('local');
    expect(resolveProviderProfile({ COWORK_PROMPT_ENHANCER_PROVIDER: 'openai_compatible' })).toBe('openai-compatible');
  });

  test('rejects conflicts and unknown profiles', () => {
    expect(() =>
      resolveProviderProfile({ COWORK_PROFILE: 'mock', COWORK_PROMPT_ENHANCER_PROVIDER: 'llama_server' })
    ).toThrow('conflicts');
    expect(() => resolveProviderProfile({ COWORK_PROFILE: 'vendor' })).toThrow('Unsupported');
  });

  test('rejects invalid ports and mock scenarios before workers start', () => {
    expect(() => assertValidConfig({ COWORK_PORT: '70000' })).toThrow('valid port');
    expect(() => assertValidConfig({ COWORK_MOCK_SCENARIO: 'random' })).toThrow('COWORK_MOCK_SCENARIO');
    expect(() => assertValidConfig({ COWORK_MOCK_DELAY_MS: '-1' })).toThrow('COWORK_MOCK_DELAY_MS');
  });

  test('requires a complete vendor-neutral remote profile', () => {
    expect(() => assertValidConfig({ COWORK_PROFILE: 'openai-compatible' })).toThrow('requires');
    expect(() =>
      assertValidConfig({
        COWORK_PROFILE: 'openai-compatible',
        COWORK_OPENAI_BASE_URL: 'https://compatible.example/v1',
        COWORK_OPENAI_MODEL: 'model',
        COWORK_OPENAI_API_KEY: 'secret',
      })
    ).not.toThrow();
  });

  test('binds loopback by default and requires explicit authenticated remote operation', () => {
    expect(() => assertValidConfig({ COWORK_HOST: '127.0.0.1' })).not.toThrow();
    expect(() => assertValidConfig({ COWORK_HOST: '0.0.0.0' })).toThrow('COWORK_ALLOW_REMOTE');
    expect(() => assertValidConfig({ COWORK_HOST: '0.0.0.0', COWORK_ALLOW_REMOTE: 'true' })).toThrow(
      'COWORK_AUTH_SECRET'
    );
    expect(() =>
      assertValidConfig({
        COWORK_HOST: '0.0.0.0',
        COWORK_ALLOW_REMOTE: 'true',
        COWORK_AUTH_SECRET: 'a'.repeat(32),
      })
    ).not.toThrow();
  });

  test('rejects inconsistent resource bounds before workers start', () => {
    expect(() => assertValidConfig({ COWORK_MAX_FRAME_BYTES: '100', COWORK_MAX_PAYLOAD_BYTES: '101' })).toThrow(
      'cannot exceed'
    );
    expect(() => assertValidConfig({ COWORK_MAX_ACTIVE_COMMANDS: '1', COWORK_MAX_SESSION_COMMANDS: '2' })).toThrow(
      'cannot exceed'
    );
    expect(() => assertValidConfig({ COWORK_MAX_QUEUED_COMMANDS: '0' })).toThrow('positive integer');
  });
});
