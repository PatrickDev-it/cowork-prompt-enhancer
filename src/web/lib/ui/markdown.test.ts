import { describe, expect, test } from 'bun:test';
import { tokenizeInline } from './markdown';

/** The DOM half is exercised in the browser; the tokenizer is the part with real logic, and it is
 * where an injection would have to start. */
describe('tokenizeInline', () => {
  test('leaves plain text alone', () => {
    expect(tokenizeInline('just words')).toEqual([{ kind: 'text', value: 'just words' }]);
  });

  test('extracts inline code, which the compiler prompt asks the model to emit for paths', () => {
    expect(tokenizeInline('put it in `src/pages/`')).toEqual([
      { kind: 'text', value: 'put it in ' },
      { kind: 'code', value: 'src/pages/' },
    ]);
  });

  test('does not treat emphasis markers inside code as emphasis', () => {
    expect(tokenizeInline('`a ** b`')).toEqual([{ kind: 'code', value: 'a ** b' }]);
  });

  test('handles bold and italic', () => {
    expect(tokenizeInline('**bold** and *italic*')).toEqual([
      { kind: 'strong', value: 'bold' },
      { kind: 'text', value: ' and ' },
      { kind: 'em', value: 'italic' },
    ]);
  });

  test('does not mistake snake_case or a bare asterisk for emphasis', () => {
    expect(tokenizeInline('known_requirements')).toEqual([{ kind: 'text', value: 'known_requirements' }]);
    expect(tokenizeInline('2 * 3')).toEqual([{ kind: 'text', value: '2 * 3' }]);
  });

  test('accepts http(s) links only', () => {
    expect(tokenizeInline('[docs](https://example.com/x)')).toEqual([
      { kind: 'link', value: 'docs', href: 'https://example.com/x' },
    ]);
  });

  test('never produces a link token for a javascript: URL', () => {
    // The pattern requires http(s), so this stays inert text rather than becoming an anchor.
    const tokens = tokenizeInline('[click](javascript:alert(1))');
    expect(tokens.every((t) => t.kind !== 'link')).toBe(true);
  });

  test('treats HTML in model output as characters, never markup', () => {
    // Nothing here can become an element: every token is text, and the renderer uses
    // createTextNode / textContent rather than innerHTML.
    const tokens = tokenizeInline('<script>alert(1)</script>');
    expect(tokens).toEqual([{ kind: 'text', value: '<script>alert(1)</script>' }]);
  });

  test('terminates on unclosed markers rather than looping', () => {
    expect(tokenizeInline('`unclosed code')).toEqual([{ kind: 'text', value: '`unclosed code' }]);
    expect(tokenizeInline('**unclosed bold')).toEqual([{ kind: 'text', value: '**unclosed bold' }]);
  });

  test('handles an empty string', () => {
    expect(tokenizeInline('')).toEqual([]);
  });
});
