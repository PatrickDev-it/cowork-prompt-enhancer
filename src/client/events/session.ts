import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { SUPPORTED_OPS } from '@/events/fileop';
import { sessionDir, setSession } from '@/lib/session';
import type { $WS } from '@/lib/ws';

/**
 * Client session handshake (RFC-0008 § 1–2). Store the server UUID, create `$ROOT/{uuid}/`, and
 * advertise supported file operations without embedding tool-specific behavior.
 */
export function handleSession(WS: $WS, data: Record<string, unknown>): void {
  if (typeof data.uuid !== 'string') throw new Error('Malformed session event');
  setSession(data.uuid);
  const dir = sessionDir()!;
  try {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.gray(`Session ${data.uuid} -> ${dir}`));
  } catch (err) {
    console.error(
      chalk.red(`Unable to create session directory ${dir}: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
  WS.emit('fileops', { uuid: data.uuid, payload: { ops: SUPPORTED_OPS } });
}
