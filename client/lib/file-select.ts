import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { select } from '@inquirer/prompts';
import { INPUT_DIR } from '@/config';

const DEFAULT_EXTENSIONS = ['.txt', '.md', '.json', '.csv'];

interface FileSelectProps {
  message?: string;
  extensions?: string[];
}

/**
 * Elenca i file di `dir` con estensione consentita, ordinati — RFC-0009 § 1. Pura (nessuna
 * interazione TTY), separata da `fileSelect` per essere verificabile senza terminale.
 * Cartella assente = nessun file trovato (confine di sistema: caso normale al primo avvio,
 * non un errore — l'utente non ha ancora creato `input/`).
 */
export function listCandidateFiles(dir: string, extensions: string[] = DEFAULT_EXTENSIONS): string[] {
  const allowed = new Set(extensions.map((e) => e.toLowerCase()));
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && allowed.has(extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

/**
 * Prompt key `file-select` — RFC-0009 § 1, § 2. Sostituisce l'`input` a riga singola per
 * testi lunghi/strutturati: l'utente prepara il testo in un file dentro `INPUT_DIR`, sceglie
 * quale file usare da una `select`, il valore risolto è il contenuto del file (non il nome).
 * Registrato in `promptsByKey` come ogni altro key: nessuna conoscenza di dominio nel client.
 */
export async function fileSelect(props: FileSelectProps): Promise<string> {
  const extensions = props.extensions ?? DEFAULT_EXTENSIONS;
  const files = listCandidateFiles(INPUT_DIR, extensions);
  if (files.length === 0) {
    throw new Error(`Nessun file (${extensions.join(', ')}) trovato in ${INPUT_DIR}. Aggiungine uno e riprova.`);
  }
  const chosen = await select({
    message: props.message ?? 'Quale file vuoi usare?',
    choices: files.map((name) => ({ name, value: name })),
  });
  return readFileSync(join(INPUT_DIR, chosen), 'utf8');
}
