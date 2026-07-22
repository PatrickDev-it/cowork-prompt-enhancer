import { describe, expect, test } from 'bun:test';
import { scanText } from './secret-scan';

describe('high-confidence secret scanning', () => {
  test('detects credentials without flagging placeholders', () => {
    expect(scanText('fixture', 'github_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ')).toHaveLength(1);
    expect(scanText('.env.example', 'COWORK_OPENAI_API_KEY=replace-me')).toHaveLength(0);
  });

  test('detects private key material', () => {
    expect(scanText('fixture', '-----BEGIN PRIVATE KEY-----')).toEqual([{ file: 'fixture', rule: 'private-key' }]);
  });
});
