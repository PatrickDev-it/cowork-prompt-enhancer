import { describe, expect, test } from 'bun:test';
import { scanText } from './secret-scan';

describe('high-confidence secret scanning', () => {
  test('detects credentials without flagging placeholders', () => {
    const credential = ['github', '_pat_', 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ'].join('');
    expect(scanText('fixture', credential)).toHaveLength(1);
    expect(scanText('.env.example', 'COWORK_OPENAI_API_KEY=replace-me')).toHaveLength(0);
  });

  test('detects private key material', () => {
    const keyHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    expect(scanText('fixture', keyHeader)).toEqual([{ file: 'fixture', rule: 'private-key' }]);
  });
});
