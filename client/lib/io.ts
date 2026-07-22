import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { INPUT_DIR, ROOT } from '@/config';

/**
 * Create the input and output roots during client startup. `INPUT_DIR` must exist before connection so
 * the operator can place a request file there; the session handler creates the final session subdirectory.
 */
export function ensureIODirs() {
  for (const dir of [INPUT_DIR, ROOT]) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(chalk.red(`Unable to create ${dir}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  console.log(chalk.gray(`I/O ready - input: ${INPUT_DIR} | output: ${ROOT}`));
}
