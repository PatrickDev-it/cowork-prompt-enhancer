/**
 * Hand-written inline SVG icons. No icon library and no sprite request: the page's claim is that
 * nothing leaves the browser, and that has to hold on first paint too — a CDN fetch for glyphs
 * would contradict it. All three inherit `currentColor` and size from the button.
 */

function svg(paths: string[], extra: Record<string, string> = {}): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const node = document.createElementNS(NS, 'svg');
  node.setAttribute('viewBox', '0 0 16 16');
  node.setAttribute('width', '16');
  node.setAttribute('height', '16');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.5');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  for (const [key, value] of Object.entries(extra)) node.setAttribute(key, value);

  for (const d of paths) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    node.append(path);
  }
  return node;
}

/** Two offset sheets — the universally understood copy affordance. */
export function copyIcon(): SVGSVGElement {
  return svg([
    'M6 6.5A1.5 1.5 0 0 1 7.5 5h5A1.5 1.5 0 0 1 14 6.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 6 11.5z',
    'M10 5V3.5A1.5 1.5 0 0 0 8.5 2h-5A1.5 1.5 0 0 0 2 3.5v5A1.5 1.5 0 0 0 3.5 10H5',
  ]);
}

export function checkIcon(): SVGSVGElement {
  return svg(['M3 8.5 6.2 12 13 4.5']);
}

/** Arrow into a tray: says "download" without a label, which the bare ".md" text did not. */
export function downloadIcon(): SVGSVGElement {
  return svg(['M8 2v7.5', 'M4.75 6.75 8 10l3.25-3.25', 'M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1']);
}
