import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { SUPPORTED_OPS } from '@/events/fileop';
import { sessionDir, setSession } from '@/lib/session';
import type { $WS } from '@/lib/ws';

/**
 * Handshake di sessione lato client — RFC-0008 § 1, § 2. Memorizza l'uuid comunicato dal
 * server, crea subito la cartella di sessione $ROOT/{uuid}/, e annuncia al server le fileop
 * che questo client sa eseguire. Nessuna conoscenza di dominio: pura predisposizione.
 */
export function handleSession(WS: $WS, data: Record<string, unknown>): void {
  if (typeof data.uuid !== 'string') throw new Error('Malformed session event');
  setSession(data.uuid);
  const dir = sessionDir()!;
  try {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.gray(`Sessione ${data.uuid} → ${dir}`));
  } catch (err) {
    console.error(
      chalk.red(
        `Impossibile creare la cartella di sessione ${dir}: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }
  WS.emit('fileops', { uuid: data.uuid, payload: { ops: SUPPORTED_OPS } });
}
