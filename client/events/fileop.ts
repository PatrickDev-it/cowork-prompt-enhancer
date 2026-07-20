import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import chalk from 'chalk';
import { sessionDir } from '@/lib/session';

interface FileOpRequest {
  op: string;
  path: string;
  content?: string;
  to?: string;
}

/**
 * Confina un percorso relativo dentro la cartella di sessione — RFC-0008 § 6. Confine di
 * sistema: `rel` arriva dalla rete. Ritorna il percorso assoluto se resta dentro `base`,
 * altrimenti null (percorso assoluto, vuoto, o `..` che esce dalla sessione).
 */
function confine(base: string, rel: string): string | null {
  if (typeof rel !== 'string' || rel.length === 0 || isAbsolute(rel)) return null;
  const target = resolve(base, rel);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

const handlers: Record<string, (target: string, req: FileOpRequest) => void> = {
  write: (target, req) => {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, req.content ?? '', 'utf8');
  },
  append: (target, req) => {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, req.content ?? '', 'utf8');
  },
  mkdir: (target) => {
    mkdirSync(target, { recursive: true });
  },
  delete: (target) => {
    rmSync(target, { recursive: true, force: true });
  },
  move: (target, req) => {
    const dest = confine(sessionDir()!, req.to ?? '');
    if (!dest) throw new Error(`destinazione non consentita '${req.to}'`);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(target, dest);
  },
};

/** Insieme delle fileop supportate, annunciato al server — RFC-0008 § 2. */
export const SUPPORTED_OPS = Object.keys(handlers);

/**
 * Esecutore generico dell'evento `fileop` — RFC-0008 § 4. Nessuna conoscenza di dominio:
 * esegue l'operazione descritta, confinata nella cartella di sessione. Un errore è locale,
 * si logga e non si propaga al server (§ 6).
 */
export function handleFileop(data: { uuid: string; payload: FileOpRequest }) {
  const base = sessionDir();
  if (!base) {
    console.error(chalk.red('fileop ricevuta senza sessione attiva, ignorata.'));
    return;
  }
  const { payload } = data;
  const handler = handlers[payload.op];
  if (!handler) {
    console.error(chalk.red(`fileop sconosciuta '${payload.op}', ignorata.`));
    return;
  }
  const target = confine(base, payload.path);
  if (!target) {
    console.error(chalk.red(`fileop '${payload.op}' con percorso non consentito '${payload.path}', ignorata.`));
    return;
  }
  try {
    handler(target, payload);
    console.log(chalk.green(`✔ ${payload.op} ${payload.path}${payload.to ? ` → ${payload.to}` : ''}`));
  } catch (err) {
    console.error(
      chalk.red(
        `✖ fileop '${payload.op}' su '${payload.path}' fallita: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
}
