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
 * List files in `dir` with allowed extensions in stable order (RFC-0009 § 1). This pure path remains
 * separate from `fileSelect` for testing without a TTY. A missing directory returns no files because
 * an empty input directory is a normal first-run condition.
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
 * `file-select` prompt key (RFC-0009 § 1–2). The operator prepares long or structured text under
 * `INPUT_DIR`, selects a file, and receives its content rather than its name. Registration through
 * `promptsByKey` keeps domain knowledge out of the client prompt dispatcher.
 */
export async function fileSelect(props: FileSelectProps): Promise<string> {
  const extensions = props.extensions ?? DEFAULT_EXTENSIONS;
  const files = listCandidateFiles(INPUT_DIR, extensions);
  if (files.length === 0) {
    throw new Error(`No ${extensions.join(', ')} file found in ${INPUT_DIR}. Add one and retry.`);
  }
  const chosen = await select({
    message: props.message ?? 'Which file do you want to use?',
    choices: files.map((name) => ({ name, value: name })),
  });
  return readFileSync(join(INPUT_DIR, chosen), 'utf8');
}
