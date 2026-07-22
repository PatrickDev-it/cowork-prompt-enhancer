import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';

export interface LinkFailure {
  file: string;
  target: string;
  reason: string;
}

function withoutCodeFences(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gm, '');
}

export function markdownLinks(markdown: string): string[] {
  const links: string[] = [];
  const source = withoutCodeFences(markdown);
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1]?.trim() ?? '';
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    else target = target.split(/\s+["']/u, 1)[0] ?? '';
    if (target) links.push(target);
  }
  return links;
}

export function githubAnchor(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function markdownAnchors(file: string): Set<string> {
  const anchors = new Set<string>();
  const duplicates = new Map<string, number>();
  const source = withoutCodeFences(readFileSync(file, 'utf8'));
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = githubAnchor(match[1] ?? '');
    if (!base) continue;
    const count = duplicates.get(base) ?? 0;
    duplicates.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

export function checkMarkdownFile(file: string, root: string): LinkFailure[] {
  const failures: LinkFailure[] = [];
  for (const rawTarget of markdownLinks(readFileSync(file, 'utf8'))) {
    if (/^(?:https?:|mailto:|tel:)/i.test(rawTarget)) continue;
    const [encodedPath, encodedAnchor = ''] = rawTarget.split('#', 2);
    let localPath: string;
    let anchor: string;
    try {
      localPath = decodeURIComponent(encodedPath ?? '');
      anchor = decodeURIComponent(encodedAnchor);
    } catch {
      failures.push({ file: relative(root, file), target: rawTarget, reason: 'invalid URL encoding' });
      continue;
    }
    const destination = localPath ? resolve(dirname(file), localPath) : file;
    if (!existsSync(destination)) {
      failures.push({ file: relative(root, file), target: rawTarget, reason: 'target does not exist' });
      continue;
    }
    if (anchor && extname(destination).toLowerCase() === '.md' && !markdownAnchors(destination).has(anchor)) {
      failures.push({ file: relative(root, file), target: rawTarget, reason: 'heading does not exist' });
    }
  }
  return failures;
}

export function trackedMarkdown(root: string): string[] {
  const result = Bun.spawnSync(['git', 'ls-files', '-z', '*.md'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim());
  return new TextDecoder()
    .decode(result.stdout)
    .split('\0')
    .filter(Boolean)
    .map((file) => resolve(root, file));
}

export function checkDocumentation(root = resolve(import.meta.dir, '..')): LinkFailure[] {
  return trackedMarkdown(root).flatMap((file) => checkMarkdownFile(file, root));
}

if (import.meta.main) {
  const failures = checkDocumentation();
  if (failures.length) {
    for (const failure of failures) console.error(`${failure.file}: ${failure.target} - ${failure.reason}`);
    process.exit(1);
  }
  console.log(`Documentation links valid (${trackedMarkdown(resolve(import.meta.dir, '..')).length} files).`);
}
