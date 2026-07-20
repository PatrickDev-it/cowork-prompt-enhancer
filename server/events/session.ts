import type { $WSServer } from '@/lib/ws';
import { rememberAdvertisedOps } from '@/tools/fs';

/**
 * Handshake di sessione — RFC-0008 § 1, § 2. Il server comunica al client l'uuid di sessione
 * (generato in server.upgrade, RFC-0002 § 1) e ascolta l'annuncio delle fileop supportate.
 * Va invocato all'apertura della connessione, prima del menu, così l'annuncio arriva prima
 * che qualunque tool possa essere invocato.
 */
export function openSession(WS: $WSServer) {
  WS.on('fileops', (data: { payload?: { ops?: unknown } }) => {
    rememberAdvertisedOps(WS, data.payload?.ops);
  });
  WS.emit('session', { uuid: WS.sessionId });
}
