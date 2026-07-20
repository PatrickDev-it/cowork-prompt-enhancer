import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export interface StatusPayload {
  tool: string;
  sub_event: 'start' | 'progress' | 'log' | 'done' | 'error';
  message?: string;
  percent?: number;
}

const spinners = new Map<string, Ora>();

function line(tool: string, message?: string, percent?: number) {
  const label = chalk.cyan(tool);
  const pct = percent !== undefined ? chalk.dim(` (${percent}%)`) : '';
  return message ? `${label}${pct} — ${message}` : `${label}${pct}`;
}

/**
 * Unico punto che traduce lo stream `status` (server → client) in animazione visibile
 * sul terminale — RFC-0003 § 4. Nessun ramo qui conosce la semantica di un tool specifico.
 */
export function handleStatusUpdate({ tool, sub_event, message, percent }: StatusPayload) {
  switch (sub_event) {
    case 'start': {
      spinners.get(tool)?.stop();
      spinners.set(tool, ora({ text: line(tool, message) }).start());
      break;
    }
    case 'progress': {
      const spinner = spinners.get(tool) ?? ora().start();
      spinner.text = line(tool, message, percent);
      spinners.set(tool, spinner);
      break;
    }
    case 'log': {
      const spinner = spinners.get(tool);
      if (spinner) spinner.text = line(tool, message);
      else console.log(chalk.dim(line(tool, message)));
      break;
    }
    case 'done': {
      const spinner = spinners.get(tool);
      if (spinner) spinner.succeed(line(tool, message));
      else console.log(chalk.green(`✔ ${line(tool, message)}`));
      spinners.delete(tool);
      break;
    }
    case 'error': {
      const spinner = spinners.get(tool);
      if (spinner) spinner.fail(line(tool, message));
      else console.log(chalk.red(`✖ ${line(tool, message)}`));
      spinners.delete(tool);
      break;
    }
  }
}
