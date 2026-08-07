import type { $WSServer } from '@/lib/ws';
import { rememberAdvertisedOps } from '@/tools/fs';

/**
 * Handshake di sessione — RFC-0008 § 1, § 2. Il server comunica al client l'uuid di sessione
 * (generato in server.upgrade, RFC-0002 § 1) e ascolta l'annuncio delle fileop supportate.
 * Va invocato all'apertura della connessione, prima del menu, così l'annuncio arriva prima
 * che qualunque tool possa essere invocato.
 */
export function openSession(WS: $WSServer) {
  WS.on('fileops', (data) => {
    const payload = typeof data.payload === 'object' && data.payload !== null ? data.payload : {};
    rememberAdvertisedOps(WS, (payload as { ops?: unknown }).ops);
  });
  WS.on('fileop-result', (data, message) => {
    const payload = typeof data.payload === 'object' && data.payload !== null ? data.payload : {};
    const result = payload as { ok?: unknown; code?: unknown; message?: unknown };
    if (result.ok === false && result.code === 'path_rejected') {
      WS.sendError(message.id, 'path_rejected', typeof result.message === 'string' ? result.message : 'Path rejected');
    }
  });
  WS.emit('session', { uuid: WS.sessionId });
}
