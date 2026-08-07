/**
 * Deterministic task-kind classifier, ported from `strategies.classify_target`
 * (`src/server/modules/prompt_enhancer/strategies.py`). Its output gates the Technical Expansion
 * Policy in the compile prompts. Deterministic and free by design — RFC-0018 § 5 rejects an LLM
 * classifier here because it would reintroduce the serial chain RFC-0011 removed.
 *
 * This is a *superset* of the server's regex, not a copy, because the server's version has two
 * measured gaps (2026-08-07):
 *
 *   1. Italian imperatives take enclitic pronouns — `creami`, `scrivimi`, `fammi` — and `\bcrea\b`
 *      does not match `creami`. The user request that exposed all of this,
 *      "creami una static blog page in astro framework", classified as `conversational`.
 *   2. The framework list stopped at the 2024 cohort: `astro`, `nuxt`, `remix`, `sveltekit`,
 *      `qwik`, `solid`, `vite` and the static-site generators were all absent.
 *
 * Together those meant the project's own flagship README example — "add login and make it secure,
 * use the db we already have" — also classified as `conversational`. The server has the same gap
 * and is worth fixing there too; this file does not change the server's behaviour.
 *
 * The asymmetry is deliberate: this is a developer tool, so a false `technical` merely applies
 * expansion guidance to a prose task, while a false `conversational` produces exactly the
 * content-free filler this classifier exists to prevent. When in doubt it leans technical.
 */

export type TaskKind = 'technical' | 'conversational';

const TECHNICAL_SIGNAL = new RegExp(
  [
    // Actions — English, plus Italian stems left open so enclitic pronouns still match
    // (`crea|creami|creamelo`, `implementa|implementami`).
    String.raw`implement\w*|build|deploy\w*|debug\w*|refactor\w*|`,
    String.raw`crea\w*|creat\w*|svilupp\w*|programm\w*|scriv\w*|`,
    String.raw`fix|corregg\w*|aggiung\w*|sistem\w*|integr\w*|migr\w*|genera\w*|`,
    // Surfaces and artefacts
    String.raw`api|endpoint|database|db|sql|schema|migration|backend|frontend|full[- ]?stack|`,
    String.raw`page|pagina|sito|website|web ?app|webapp|dashboard|landing|blog|`,
    String.raw`component\w*|componente|layout|route|routing|middleware|`,
    // Frameworks and runtimes — the 2024 cohort plus what the server's list predated
    String.raw`react|next\.?js|vue|angular|svelte(?:kit)?|astro|nuxt|remix|solid(?:js)?|qwik|`,
    String.raw`vite|webpack|tailwind|gatsby|eleventy|hugo|jekyll|static site|ssg|ssr|`,
    String.raw`node|deno|bun|express|fastapi|django|flask|rails|spring|laravel|`,
    // Infrastructure
    String.raw`docker|kubernetes|k8s|ci/?cd|pipeline|terraform|nginx|`,
    // Language and code units
    String.raw`funzione|function|classe|class|script|cli|sdk|regex|type|typing|`,
    String.raw`typescript|javascript|python|rust|golang|go\b|java\b|c\+\+|c#|php|ruby|swift|kotlin|`,
    // Engineering concerns that only appear in technical requests
    String.raw`microservi\w*|auth\w*|login|logout|token|oauth|test\w*|bug|compil\w*|`,
    String.raw`cache|caching|responsive|accessibilit\w*|performance|refactor`,
  ].join(''),
  'i'
);

// Word-boundary wrapper applied once, so each alternative above stays readable.
const BOUNDED = new RegExp(String.raw`\b(${TECHNICAL_SIGNAL.source})`, 'i');

export function classifyTaskKind(userInput: string): TaskKind {
  return BOUNDED.test(userInput ?? '') ? 'technical' : 'conversational';
}
