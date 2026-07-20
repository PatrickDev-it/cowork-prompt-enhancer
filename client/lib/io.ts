import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { INPUT_DIR, ROOT } from '@/config';

/**
 * Crea `(io)/input` e `(io)/output` se assenti — controllato allo start del client, non solo
 * all'apertura di una sessione: `INPUT_DIR` deve esistere già perché l'utente ci depositi un
 * file prima ancora di connettersi al server (RFC-0009 § 1); `ROOT` viene predisposto qui per
 * lo stesso motivo, oltre alla sottocartella di sessione creata poi da `events/session.ts`.
 */
export function ensureIODirs() {
  for (const dir of [INPUT_DIR, ROOT]) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(chalk.red(`Impossibile creare ${dir}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  console.log(chalk.gray(`(io) pronta — input: ${INPUT_DIR} | output: ${ROOT}`));
}
