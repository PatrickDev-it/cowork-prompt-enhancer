/**
 * Domain classifier for the browser tier.
 *
 * Replaces the earlier technical/conversational binary, which was ported from the server's
 * `classify_target` and was the wrong shape for this surface. The terminal client is a developer
 * tool; the website is the general-purpose one, and a binary that leans technical turned
 * "creare un template di email … per possibili lead" — a communication task — into a request for
 * routing conventions and `.tsx` boundaries.
 *
 * What the domain selects is only a list of *dimensions to consider*, never vocabulary to emit.
 * `general` is a real fallback with useful dimensions rather than a dead end, so an unrecognised
 * request still gets a considered specification instead of software defaults.
 *
 * Detection is deterministic and free: RFC-0018 § 5 rejects an LLM classifier here because it
 * would reintroduce the serial chain RFC-0011 removed.
 */

export type Domain = 'software' | 'communication' | 'content' | 'data' | 'design' | 'general';

/** Signals are Italian and English throughout — the product is used in both, and the bug that
 * motivated the previous rewrite was an Italian imperative (`creami`) the server regex missed.
 * Verb stems stay open (`crea\w*`) so enclitic pronouns still match. */
const SIGNALS: Array<{ domain: Exclude<Domain, 'general'>; re: RegExp }> = [
  {
    domain: 'communication',
    re: /\b(email|e-?mail|mail|newsletter|messagg\w*|message|outreach|lead|prospect|candidat\w*|client[ei]?|customer|invit\w*|reminder|promemoria|follow[- ]?up|campagna|campaign|cold ?(?:call|mail)|risposta|reply|template di (?:email|mail)|firma|signature)\b/i,
  },
  {
    domain: 'software',
    re: /\b(api|endpoint|database|sql|schema|migration|backend|frontend|component\w*|componente|route|routing|middleware|deploy\w*|refactor\w*|debug\w*|bug|compil\w*|repository|repo|commit|react|next\.?js|vue|angular|svelte(?:kit)?|astro|nuxt|remix|qwik|vite|webpack|tailwind|gatsby|hugo|jekyll|node|deno|bun|express|fastapi|django|flask|rails|spring|laravel|docker|kubernetes|k8s|ci\/?cd|terraform|nginx|typescript|javascript|python|rust|golang|java\b|php|ruby|swift|kotlin|funzione|function|classe|class|script|cli|sdk|regex|test\w*|webapp|web ?app|sito web|website|landing|dashboard|auth\w*|login|token|oauth)\b/i,
  },
  {
    domain: 'data',
    re: /\b(analisi|analys\w*|analytics|report|reportistica|dataset|dati|data|metric\w*|metrich\w*|kpi|dashboard di dati|grafic\w*|chart|statistic\w*|forecast|prevision\w*|csv|excel|spreadsheet|foglio di calcolo|query|aggregat\w*|segmentazione|segmentation)\b/i,
  },
  {
    domain: 'design',
    re: /\b(design|logo|brand\w*|palette|mockup|wireframe|prototip\w*|prototype|illustrazione|illustration|banner|poster|locandina|copertina|cover|icona|icon|tipograf\w*|typography|layout grafico|ui kit|figma)\b/i,
  },
  {
    domain: 'content',
    re: /\b(articol\w*|article|blog post|post|testo|text|cop(?:y|ywriting)|contenut\w*|content|document\w*|documentazione|guida|guide|tutorial|manuale|manual|descrizione|description|traduz\w*|translat\w*|riassunt\w*|summar\w*|scriv\w*|writ(?:e|ing)|redigere|storia|story|script|sceneggiatura|presentazione|presentation|slide)\b/i,
  },
];

export function classifyDomain(userInput: string): Domain {
  const input = userInput ?? '';
  for (const { domain, re } of SIGNALS) {
    if (re.test(input)) return domain;
  }
  return 'general';
}

/**
 * The dimensions a professional in that domain would consider but a rough request rarely states.
 * Phrased as prompts to think about, never as content to copy — the previous patch's concrete
 * examples were reproduced verbatim by the model, which is exactly what this avoids.
 */
export const DOMAIN_DIMENSIONS: Record<Domain, string> = {
  software:
    'project structure, data model, error and empty states, input validation, typing, testing, performance, accessibility',
  communication:
    'who receives it and what they already know, subject line, the parts that change per recipient, tone, the single action you want them to take, timing and follow-up, how to opt out',
  content: 'audience and their prior knowledge, purpose, structure and sections, length, voice, sources or evidence',
  data: 'where the numbers come from, which metrics, granularity and time range, how the result is validated, how it is presented',
  design:
    'format and dimensions, where it will be seen, brand or style constraints, accessibility and contrast, deliverable file types',
  general: 'who it is for, what it must achieve, the format it should take, the scope, how you will know it is good',
};
