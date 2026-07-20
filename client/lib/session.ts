import { join } from 'node:path';
import { ROOT } from '@/config';

/**
 * Stato di sessione condiviso tra gli handler `session` e `fileop` — RFC-0008 § 1.
 * L'uuid è generato dal server e comunicato all'apertura; tutti gli artefatti della
 * connessione vivono sotto $ROOT/{uuid}/, unica cartella di sessione.
 */
let sessionUuid: string | null = null;

export function setSession(uuid: string) {
  sessionUuid = uuid;
}

/** Cartella di sessione ($ROOT/{uuid}), o null se l'handshake non è ancora avvenuto. */
export function sessionDir(): string | null {
  return sessionUuid ? join(ROOT, sessionUuid) : null;
}
