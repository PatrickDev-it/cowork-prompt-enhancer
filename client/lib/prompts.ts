import { checkbox, confirm, input, number, password, select } from '@inquirer/prompts';
import { fileSelect } from './file-select';
import { projectSelect } from './project-select';

const promptsByKey: Record<string, (props: any) => Promise<unknown>> = {
  input,
  select,
  confirm,
  checkbox,
  number,
  password,
  'file-select': fileSelect,
  'project-select': projectSelect,
};

let lock: Promise<unknown> = Promise.resolve();

/** Serializza prompt concorrenti: due eventi WS ravvicinati non devono sovrapporre prompt sullo stesso TTY. */
async function withPromptLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function resetTTY() {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(false);
  process.stdin.resume();
  await new Promise((r) => setTimeout(r, 0));
  process.stdin.setRawMode(true);
}

/** Esegue un prompt `@inquirer/prompts` descritto come dati — RFC-0002 § 6. */
export async function prompt(key: string, props: Record<string, unknown>): Promise<unknown> {
  return withPromptLock(async () => {
    await resetTTY();
    const fn = promptsByKey[key];
    if (!fn) throw new Error(`Prompt sconosciuto: ${key}`);
    const result = await fn(props);
    await resetTTY();
    return result;
  });
}
