import { type ActiveField, applyDismissals, type CompiledSpec, renderSpec, SECTION_META } from '../prompt';
import { copyIcon, checkIcon } from './icons';
import { renderInlineMarkdown } from './markdown';

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
  private active: ActiveField | null = null;
  private pending: ReadonlyArray<keyof CompiledSpec> = [];
  private readonly dismissed = new Set<string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly options: SpecViewOptions
  ) {}

  /** Replaces the rendered spec. Dismissals are keyed by item text, so an inference the user
   * already rejected stays rejected across a re-compile that produces it again. */
  setSpec(spec: Partial<CompiledSpec>): void {
    this.spec = spec;
    this.active = null;
    this.pending = [];
    this.render();
  }

  /**
   * Streaming update. `active` is the field currently being written, rendered mid-sentence with a
   * caret; `pending` are fields this pass will produce but has not reached yet, drawn as pulsing
   * skeletons.
   *
   * The skeletons exist because the longest section (`inferred_requirements`) can generate for
   * many seconds on-device, and with nothing below it the page looked finished when it was not.
   */
  setStreaming(
    spec: Partial<CompiledSpec>,
    active: ActiveField | null,
    pending: ReadonlyArray<keyof CompiledSpec> = []
  ): void {
    this.spec = spec;
    this.active = active;
    this.pending = pending;
    this.render();
  }

  clear(): void {
    this.spec = {};
    this.active = null;
    this.pending = [];
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
    if (directive) cards.push(this.buildCard('Directive', 'neutral', directive, directive, false));

    for (const { label, field, isList, provenance } of SECTION_META) {
      const streaming = this.active?.field === field;
      const value = visible[field];

      if (isList) {
        const items = [...(((value as string[] | undefined) ?? []) as string[])];
        if (streaming && this.active) items.push(...this.active.completedItems);
        const partial = streaming ? this.active?.partialText : '';
        if (items.length === 0 && !partial) continue;
        cards.push(
          this.buildCard(
            label,
            provenance,
            items,
            `# ${label}\n${items.map((i) => `- ${i}`).join('\n')}`,
            streaming,
            partial
          )
        );
        continue;
      }

      const text = streaming && this.active ? this.active.partialText : ((value as string | undefined)?.trim() ?? '');
      if (!text) continue;
      cards.push(this.buildCard(label, provenance, text, `# ${label}\n${text}`, streaming));
    }

    for (const field of this.pending) {
      const meta = SECTION_META.find((section) => section.field === field);
      if (!meta) continue;
      const hasContent = Array.isArray(visible[field])
        ? (visible[field] as string[]).length > 0
        : Boolean((visible[field] as string | undefined)?.trim());
      if (hasContent || this.active?.field === field) continue;
      cards.push(this.buildSkeleton(meta.label, meta.provenance, meta.isList));
    }

    this.root.setAttribute('aria-busy', String(this.pending.length > 0 || this.active !== null));
    this.root.replaceChildren(...cards);
  }

  /** Placeholder for a section this pass will produce but has not started. Carries the real title
   * and provenance colour so the layout does not shift when content replaces it. */
  private buildSkeleton(label: string, provenance: 'explicit' | 'inferred' | 'neutral', isList: boolean): HTMLElement {
    const card = document.createElement('section');
    card.className = 'card card-skeleton';
    card.dataset.provenance = provenance;

    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = label;
    head.append(title);
    card.append(head);

    const body = document.createElement('div');
    body.className = 'skeleton-body';
    // Two lines for prose, three for a list — enough to read as "more is coming" without
    // pretending to know how long the real content will be.
    for (let i = 0; i < (isList ? 3 : 2); i++) {
      const line = document.createElement('span');
      line.className = 'skeleton-line';
      body.append(line);
    }
    card.append(body);

    return card;
  }

  private buildCard(
    label: string,
    provenance: 'explicit' | 'inferred' | 'neutral',
    content: string | string[],
    copyText: string,
    streaming: boolean,
    partial = ''
  ): HTMLElement {
    const card = document.createElement('section');
    card.className = 'card';
    card.dataset.provenance = provenance;
    if (streaming) card.dataset.streaming = 'true';

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

    // Icon-only while streaming would be misleading (the text is incomplete), so the copy control
    // only appears once the section has settled.
    if (!streaming) head.append(this.buildCopyButton(copyText, label));

    card.append(head);

    if (typeof content === 'string') {
      const p = document.createElement('p');
      renderInlineMarkdown(p, content);
      if (streaming) p.append(this.caret());
      card.append(p);
    } else {
      card.append(this.buildList(content, provenance === 'inferred', partial, streaming));
    }

    return card;
  }

  private buildCopyButton(copyText: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.title = `Copy ${label}`;
    button.setAttribute('aria-label', `Copy ${label}`);
    button.append(copyIcon());
    button.addEventListener('click', () => {
      this.options.onCopyText(copyText, label);
      button.replaceChildren(checkIcon());
      button.dataset.confirmed = 'true';
      window.setTimeout(() => {
        button.replaceChildren(copyIcon());
        delete button.dataset.confirmed;
      }, 1200);
    });
    return button;
  }

  private caret(): HTMLElement {
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    return caret;
  }

  private buildList(items: string[], dismissable: boolean, partial: string, streaming: boolean): HTMLElement {
    const list = document.createElement('ul');

    for (const item of items) {
      const li = document.createElement('li');

      const text = document.createElement('span');
      text.className = 'item-text';
      renderInlineMarkdown(text, item);
      li.append(text);

      if (dismissable) {
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'dismiss';
        drop.textContent = '✕';
        drop.title = 'Remove this assumption';
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

    if (streaming && partial) {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'item-text';
      renderInlineMarkdown(text, partial);
      text.append(this.caret());
      li.append(text);
      list.append(li);
    }

    return list;
  }
}
