import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { checkbox, input } from '@inquirer/prompts';
import { PROJECT_SCAN } from '@/config';

/**
 * `project-select` primitive — RFC-0021 § 1, paired with `file-select` (RFC-0009). It scans a project
 * tree locally on the client, lets the operator choose files, and returns their content in one string.
 * The pure `listProjectTree` path remains separate from the interactive `projectSelect` path for
 * deterministic testing without a TTY.
 *
 * `PROJECT_SCAN` filters are a security contract: secrets, build/dependency directories and oversized
 * files never cross the client-to-server egress boundary (RFC-0021 security section).
 */

interface ProjectSelectProps {
  message?: string;
  defaultDir?: string;
}

/** Convert a basename glob-lite pattern containing `*` into an anchored, case-insensitive RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

const SECRET_MATCHERS = PROJECT_SCAN.denySecrets.map(globToRegExp);

/** Return whether a basename matches the security denylist. */
export function isSecretFile(name: string): boolean {
  return SECRET_MATCHERS.some((re) => re.test(name));
}

function isAllowedFile(name: string): boolean {
  if (isSecretFile(name)) return false;
  return PROJECT_SCAN.allowExtensions.has(extname(name).toLowerCase());
}

/**
 * List candidate paths beneath `root` without a TTY. Denied directories, secret files, extensions
 * outside the allowlist, oversized files and entries beyond the depth limit are excluded. A missing or
 * unreadable directory returns no candidates because it is a normal system-boundary condition.
 */
export function listProjectTree(root: string, maxResults = 5000): string[] {
  const out: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > PROJECT_SCAN.maxDepth || out.length >= maxResults) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxResults) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (PROJECT_SCAN.denyDirs.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (!isAllowedFile(entry.name)) continue;
        try {
          if (statSync(full).size > PROJECT_SCAN.maxFileBytes) continue;
        } catch {
          continue;
        }
        out.push(relative(root, full).split('\\').join('/'));
      }
    }
  };

  walk(resolve(root), 0);
  return out.sort();
}

/**
 * Render an ASCII project tree from paths already filtered by `listProjectTree`. The tree cannot reveal
 * denied files or directories and remains available even when no complete file is selected. `maxBytes`
 * is deducted from the total context budget to preserve the provider prefill bound (RFC-0024).
 */
export function renderProjectTree(relPaths: string[], maxBytes = PROJECT_SCAN.maxTreeBytes): string {
  interface TreeNode {
    children: Map<string, TreeNode>;
  }
  const root: TreeNode = { children: new Map() };

  for (const rel of relPaths) {
    let node = root;
    for (const part of rel.split('/').filter(Boolean)) {
      let child = node.children.get(part);
      if (!child) {
        child = { children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  const lines: string[] = [];
  const render = (node: TreeNode, prefix: string): void => {
    // Directories precede files; alphabetical order keeps the map readable and deterministic.
    const entries = [...node.children.entries()].sort((a, b) => {
      const aDir = a[1].children.size > 0;
      const bDir = b[1].children.size > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });
    entries.forEach(([name, child], idx) => {
      const last = idx === entries.length - 1;
      const isDir = child.children.size > 0;
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${name}${isDir ? '/' : ''}`);
      if (isDir) render(child, `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  render(root, '');

  let tree = lines.join('\n');
  if (Buffer.byteLength(tree, 'utf8') > maxBytes) {
    let slice = tree.slice(0, maxBytes);
    const nl = slice.lastIndexOf('\n');
    if (nl > 0) slice = slice.slice(0, nl);
    tree = `${slice}\n... [directory tree truncated to the context budget]`;
  }
  return tree;
}

/**
 * Pack selected file contents into one block bounded by `budget` bytes, with explicit truncation.
 * Only path and content data are returned; the server adds the authoritative-context framing.
 */
export function packFiles(root: string, relPaths: string[], budget = PROJECT_SCAN.maxTotalBytes): string {
  const blocks: string[] = [];
  let total = 0;
  let truncated = false;

  for (const rel of relPaths) {
    if (total >= budget) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const remaining = budget - total;
    // Preserve the portion that fits, preferably ending on a line boundary, instead of discarding an
    // oversized file entirely.
    if (Buffer.byteLength(content, 'utf8') > remaining) {
      let slice = content.slice(0, remaining);
      const nl = slice.lastIndexOf('\n');
      if (nl > remaining * 0.5) slice = slice.slice(0, nl);
      blocks.push(`### ${rel}\n${slice}\n... [file truncated to the context budget]`);
      truncated = true;
      break;
    }
    total += Buffer.byteLength(content, 'utf8');
    blocks.push(`### ${rel}\n${content}`);
  }

  if (truncated) {
    blocks.push(`### Note\nContext truncated to ${budget} bytes to remain within provider limits.`);
  }
  return blocks.join('\n\n');
}

export async function projectSelect(props: ProjectSelectProps): Promise<string> {
  const dir = await input({
    message: props.message ?? 'Project directory to scan:',
    default: props.defaultDir ?? process.cwd(),
  });
  const root = resolve(dir);

  const files = listProjectTree(root);
  if (files.length === 0) {
    throw new Error(`No candidate files found in ${root}; check the path, extensions, and scan filters.`);
  }

  const chosen = await checkbox({
    message: 'Which files should be included in context? (space to select, enter to confirm)',
    choices: files.map((rel) => ({ name: rel, value: rel })),
    loop: false,
  });

  // Always include the tree and deduct it from the total budget so tree plus files remains bounded by
  // `maxTotalBytes` (RFC-0024).
  const treeBlock = `## Directory tree\n${renderProjectTree(files)}`;
  if (chosen.length === 0) return treeBlock;

  const fileBudget = Math.max(1024, PROJECT_SCAN.maxTotalBytes - Buffer.byteLength(treeBlock, 'utf8'));
  const packed = packFiles(root, chosen, fileBudget);
  return `${treeBlock}\n\n## Selected file contents\n${packed}`;
}
