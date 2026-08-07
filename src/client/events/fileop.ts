import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import chalk from 'chalk';
import { sessionDir } from '@/lib/session';

interface FileOpRequest {
  op: string;
  path: string;
  content?: string;
  to?: string;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function inside(base: string, target: string): boolean {
  const left = process.platform === 'win32' ? base.toLowerCase() : base;
  const right = process.platform === 'win32' ? target.toLowerCase() : target;
  return right === left || right.startsWith(left + sep);
}

export function confinePath(base: string, relativePath: string): string | null {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    isAbsolute(relativePath) ||
    /^[A-Za-z]:/.test(relativePath) ||
    relativePath.startsWith('//')
  ) {
    return null;
  }
  const segments = relativePath.normalize('NFC').split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes(':') ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        WINDOWS_RESERVED.test(segment)
    )
  ) {
    return null;
  }

  if (!existsSync(base)) return null;
  const canonicalBase = realpathSync.native(base);
  const target = resolve(canonicalBase, ...segments);
  if (!inside(canonicalBase, target)) return null;

  let current = canonicalBase;
  for (const segment of segments) {
    current = resolve(current, segment);
    if (!existsSync(current)) continue;
    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) return null;
    const canonical = realpathSync.native(current);
    if (!inside(canonicalBase, canonical)) return null;
  }
  return target;
}

const handlers: Record<string, (base: string, target: string, req: FileOpRequest) => void> = {
  write: (_base, target, req) => {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, req.content ?? '', 'utf8');
  },
  append: (_base, target, req) => {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, req.content ?? '', 'utf8');
  },
  mkdir: (_base, target) => {
    mkdirSync(target, { recursive: true });
  },
  delete: (_base, target) => {
    rmSync(target, { recursive: true, force: true });
  },
  move: (base, target, req) => {
    const destination = confinePath(base, req.to ?? '');
    if (!destination) throw new Error(`destination path rejected: '${req.to}'`);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(target, destination);
  },
};

export const SUPPORTED_OPS = Object.keys(handlers);

export type FileOpResult =
  | { ok: true }
  | { ok: false; code: 'path_rejected' | 'invalid_frame' | 'internal_error'; message: string };

export function handleFileop(data: Record<string, unknown>): FileOpResult {
  const base = sessionDir();
  if (!base) {
    const message = 'File operation received without an active session; ignored.';
    console.error(chalk.red(message));
    return { ok: false, code: 'internal_error', message };
  }
  const rawPayload = data.payload;
  if (typeof rawPayload !== 'object' || rawPayload === null) {
    const message = 'Malformed file operation payload; ignored.';
    console.error(chalk.red(message));
    return { ok: false, code: 'invalid_frame', message };
  }
  const payload = rawPayload as unknown as FileOpRequest;
  const handler = handlers[payload.op];
  if (!handler || typeof payload.path !== 'string') {
    const message = `Unknown or malformed file operation '${payload.op}'; ignored.`;
    console.error(chalk.red(message));
    return { ok: false, code: 'invalid_frame', message };
  }
  const target = confinePath(base, payload.path);
  if (!target) {
    const message = `File operation '${payload.op}' rejected path '${payload.path}'.`;
    console.error(chalk.red(message));
    return { ok: false, code: 'path_rejected', message };
  }
  try {
    handler(base, target, payload);
    console.log(chalk.green(`${payload.op} ${payload.path}${payload.to ? ` -> ${payload.to}` : ''}`));
    return { ok: true };
  } catch (error) {
    const message = `File operation '${payload.op}' on '${payload.path}' failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(chalk.red(message));
    return { ok: false, code: 'internal_error', message };
  }
}
