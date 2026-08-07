import { applyDismissals, type CompiledSpec, renderSpec, SECTION_META } from '../prompt';

/**
 * Renders a compiled spec as inspectable section cards.
 *
 * The point of this view — and the thing that distinguishes the product from a prompt rewriter —
 * is that it never presents the compiler's inferences as if the user had asked for them. Known
 * requirements and inferred requirements are visually distinct, and every inference can be
 * rejected, which changes what gets exported. Everything else about the render (section order,
 * skipping empty sections) is delegated to `SECTION_META` / `renderSpec` so the browser and the
 * server can never disagree about the shape of a specification.
 */

export interface SpecViewOptions {
  onChange: () => void;
  onCopyText: (text: string, label: string) => void;
}

export class SpecView {
  private spec: Partial<CompiledSpec> = {};
  private readonly dismissed = new Set<string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly options: SpecViewOptions
  ) {}

  /** Replaces the rendered spec. Dismissals are keyed by item text, so an inference the user
   * already rejected stays rejected across a re-compile that produces it again. */
  setSpec(spec: Partial<CompiledSpec>): void {
    this.spec = spec;
    this.render();
  }

  clear(): void {
    this.spec = {};
    this.dismissed.clear();
    this.root.replaceChildren();
  }

  get isEmpty(): boolean {
    return this.root.childElementCount === 0;
  }

  /** The Markdown export — always the filtered spec, so what is copied is what is on screen. */
  toMarkdown(): string {
    return renderSpec(applyDismissals(this.spec, this.dismissed));
  }

  private render(): void {
    const visible = applyDismissals(this.spec, this.dismissed);
    const cards: HTMLElement[] = [];

    const directive = visible.directive?.trim();
    if (directive) cards.push(this.buildCard('Directive', 'neutral', directive, directive));

    for (const { label, field, isList, provenance } of SECTION_META) {
      const value = visible[field];
      if (isList) {
        const items = (value as string[] | undefined) ?? [];
        if (items.length === 0) continue;
        cards.push(this.buildCard(label, provenance, items, `# ${label}\n${items.map((i) => `- ${i}`).join('\n')}`));
      } else {
        const text = (value as string | undefined)?.trim() ?? '';
        if (!text) continue;
        cards.push(this.buildCard(label, provenance, text, `# ${label}\n${text}`));
      }
    }

    this.root.replaceChildren(...cards);
  }

  private buildCard(
    label: string,
    provenance: 'explicit' | 'inferred' | 'neutral',
    content: string | string[],
    copyText: string
  ): HTMLElement {
    const card = document.createElement('section');
    card.className = 'card';
    card.dataset.provenance = provenance;

    const head = document.createElement('div');
    head.className = 'card-head';

    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = label;
    head.append(title);

    if (provenance !== 'neutral') {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.kind = provenance;
      chip.textContent = provenance === 'explicit' ? 'you said this' : 'compiler assumed this';
      head.append(chip);
    }

    const spacer = document.createElement('div');
    spacer.className = 'card-head-spacer';
    head.append(spacer);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'icon-button';
    copy.textContent = 'copy';
    copy.setAttribute('aria-label', `Copy ${label}`);
    copy.addEventListener('click', () => this.options.onCopyText(copyText, label));
    head.append(copy);

    card.append(head);

    if (typeof content === 'string') {
      const p = document.createElement('p');
      p.textContent = content;
      card.append(p);
    } else {
      card.append(this.buildList(content, provenance === 'inferred'));
    }

    return card;
  }

  private buildList(items: string[], dismissable: boolean): HTMLElement {
    const list = document.createElement('ul');

    for (const item of items) {
      const li = document.createElement('li');

      const text = document.createElement('span');
      text.className = 'item-text';
      text.textContent = item;
      li.append(text);

      if (dismissable) {
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'dismiss';
        drop.textContent = '✕';
        drop.setAttribute('aria-label', `Remove inferred requirement: ${item}`);
        drop.addEventListener('click', () => {
          this.dismissed.add(item);
          this.render();
          this.options.onChange();
        });
        li.append(drop);
      }

      list.append(li);
    }

    return list;
  }
}
