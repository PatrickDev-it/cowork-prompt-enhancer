import { describe, expect, test } from 'bun:test';
import { classifyTaskKind } from './task-kind';

describe('classifyTaskKind', () => {
  test('classifies the request that exposed the server regex gap', () => {
    // "creami" is an Italian imperative carrying an enclitic pronoun; the server's `\bcrea\b`
    // misses it, and "astro" was absent from its framework list. Both are fixed here.
    expect(classifyTaskKind('creami una static blog page in astro framework')).toBe('technical');
  });

  test('classifies the project’s own flagship README example', () => {
    // Also `conversational` on the server today — the reason the Technical Expansion Policy
    // never fired for the example the product is marketed on.
    expect(classifyTaskKind('add login and make it secure, use the db we already have')).toBe('technical');
  });

  test.each([
    'Build a typed task API with validation and tests',
    'fammi un componente react',
    'scrivimi una funzione python',
    'implementami un endpoint fastapi',
    'refactor the caching layer',
    'deploy with docker and set up ci/cd',
    'make the dashboard responsive',
    'add a sveltekit route',
    'set up a hugo static site',
  ])('classifies %p as technical', (input) => {
    expect(classifyTaskKind(input)).toBe('technical');
  });

  test.each([
    'write a poem about the sea',
    'summarise this article for me',
    'draft a polite reply to my landlord',
    'spiegami la differenza tra due quadri',
  ])('classifies %p as conversational', (input) => {
    expect(classifyTaskKind(input)).toBe('conversational');
  });

  test('handles empty and nullish input without throwing', () => {
    expect(classifyTaskKind('')).toBe('conversational');
    expect(classifyTaskKind(undefined as unknown as string)).toBe('conversational');
  });
});
