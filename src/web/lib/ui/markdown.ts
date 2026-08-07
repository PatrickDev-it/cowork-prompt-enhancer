/**
 * Minimal inline-Markdown renderer.
 *
 * Builds DOM nodes and never touches `innerHTML`. That is not stylistic: this text comes from a
 * language model, an API response, or in the BYOK case a third-party service, and it renders on a
 * page that holds the user's API keys in `localStorage`. Assigning model output to `innerHTML`
 * would make prompt injection an XSS vector against those keys. Constructing nodes means markup in
 * the model's output is displayed as characters, never parsed.
 *
 * Scope is deliberately inline-only — `code`, bold, italic, links — because that is what the
 * compiler's own prompt asks the model to emit inside field values (`prompts.py` OUTPUT MEDIUM:
 * "inline code for identifiers, paths and commands"). Block constructs are the section renderer's
 * job, not this function's.
 */

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'link'; value: string; href: string };

/** Order matters: code first, so `**` inside a code span is never treated as emphasis. */
const PATTERNS: Array<{ kind: Token['kind']; re: RegExp }> = [
  { kind: 'code', re: /`([^`\n]+)`/ },
  { kind: 'link', re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { kind: 'strong', re: /\*\*([^*\n]+)\*\*/ },
  { kind: 'em', re: /(?<![*\w])\*([^*\n]+)\*(?!\w)/ },
];

export function tokenizeInline(input: string): Token[] {
  const tokens: Token[] = [];
  let rest = input;

  while (rest.length > 0) {
    let best: { index: number; length: number; token: Token } | null = null;

    for (const { kind, re } of PATTERNS) {
      const match = re.exec(rest);
      if (!match || match.index === undefined) continue;
      if (best && match.index >= best.index) continue;
      const token: Token =
        kind === 'link'
          ? { kind: 'link', value: match[1] ?? '', href: match[2] ?? '' }
          : ({ kind, value: match[1] ?? '' } as Token);
      best = { index: match.index, length: match[0].length, token };
    }

    if (!best) {
      tokens.push({ kind: 'text', value: rest });
      break;
    }
    if (best.index > 0) tokens.push({ kind: 'text', value: rest.slice(0, best.index) });
    tokens.push(best.token);
    rest = rest.slice(best.index + best.length);
  }

  return tokens;
}

/** Renders inline Markdown into `target`, replacing its contents. */
export function renderInlineMarkdown(target: HTMLElement, input: string): void {
  const nodes: Node[] = [];

  for (const token of tokenizeInline(input)) {
    switch (token.kind) {
      case 'code': {
        const el = document.createElement('code');
        el.textContent = token.value;
        nodes.push(el);
        break;
      }
      case 'strong': {
        const el = document.createElement('strong');
        el.textContent = token.value;
        nodes.push(el);
        break;
      }
      case 'em': {
        const el = document.createElement('em');
        el.textContent = token.value;
        nodes.push(el);
        break;
      }
      case 'link': {
        // Only http(s) reaches here (the pattern requires it), which rules out `javascript:`.
        const el = document.createElement('a');
        el.href = token.href;
        el.textContent = token.value;
        el.rel = 'noopener noreferrer';
        el.target = '_blank';
        nodes.push(el);
        break;
      }
      default:
        nodes.push(document.createTextNode(token.value));
    }
  }

  target.replaceChildren(...nodes);
}
