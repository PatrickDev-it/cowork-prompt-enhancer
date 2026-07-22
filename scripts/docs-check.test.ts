import { describe, expect, test } from 'bun:test';
import { githubAnchor, markdownLinks } from './docs-check';

describe('documentation link validation', () => {
  test('extracts local links while ignoring fenced examples', () => {
    const source = '[Architecture](docs/architecture.md#system-overview)\n```md\n[missing](no.md)\n```';
    expect(markdownLinks(source)).toEqual(['docs/architecture.md#system-overview']);
  });

  test('normalizes headings using GitHub-compatible anchors', () => {
    expect(githubAnchor('Protocol & request lifecycle')).toBe('protocol-request-lifecycle');
  });
});
