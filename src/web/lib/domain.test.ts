import { describe, expect, test } from 'bun:test';
import { classifyDomain, type Domain, DOMAIN_DIMENSIONS } from './domain';

describe('classifyDomain', () => {
  test('classifies the request that was compiled as a Next.js app', () => {
    // The live failure: this returned routing conventions and `.tsx` boundaries.
    expect(
      classifyDomain('creare un tempalte di email riusabile da mandare a candidati di possibili lead per un progetto')
    ).toBe('communication');
  });

  test('still classifies the Astro request as software', () => {
    expect(classifyDomain('creami una static blog page in astro framework')).toBe('software');
  });

  test.each<[Domain, string]>([
    ['communication', 'write a cold outreach email to prospects'],
    ['communication', 'scrivimi una newsletter mensile per i clienti'],
    ['software', 'add a fastapi endpoint with validation'],
    ['software', 'fammi un componente react'],
    ['data', 'analizza i dati di vendita per trimestre'],
    ['data', 'build a report of churn metrics'],
    ['design', 'crea un logo e una palette per il brand'],
    ['design', 'design a poster for the event'],
    ['content', 'scrivi un articolo sul cambiamento climatico'],
    ['content', 'write documentation for the onboarding process'],
  ])('classifies %s: %p', (expected, input) => {
    expect(classifyDomain(input)).toBe(expected);
  });

  test.each([
    'organizza una cena per otto persone',
    'help me plan a weekend trip',
    'what should I consider before adopting a dog',
  ])('falls back to general for %p', (input) => {
    expect(classifyDomain(input)).toBe('general');
  });

  test('handles empty and nullish input', () => {
    expect(classifyDomain('')).toBe('general');
    expect(classifyDomain(undefined as unknown as string)).toBe('general');
  });

  test('communication wins over software when both could match', () => {
    // "template" and "progetto" alone must not drag a mail task into software territory — that
    // ordering is the fix for the observed failure, so pin it.
    expect(classifyDomain('template di email per il progetto')).toBe('communication');
  });
});

describe('DOMAIN_DIMENSIONS', () => {
  test('covers every domain the classifier can return', () => {
    for (const domain of ['software', 'communication', 'content', 'data', 'design', 'general'] as const) {
      expect(DOMAIN_DIMENSIONS[domain]).toBeTruthy();
    }
  });

  test('general is a real fallback, not an empty one', () => {
    expect(DOMAIN_DIMENSIONS.general.length).toBeGreaterThan(40);
  });

  test('names no technology, so nothing here can be copied into an unrelated spec', () => {
    const all = Object.values(DOMAIN_DIMENSIONS).join(' ').toLowerCase();
    for (const token of ['react', 'next', '.tsx', 'app/', 'loading.tsx', 'astro', 'python', 'docker']) {
      expect(all).not.toContain(token);
    }
  });
});
