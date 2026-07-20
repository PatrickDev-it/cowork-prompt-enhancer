import { cpus, freemem, totalmem, uptime } from 'node:os';
import type { Tool } from './types';

/** Tool smoke-test — RFC-0003 § 5. Verifica un tool senza prompt aggiuntivi ed esecuzione sincrona breve. */
export const systemInfo: Tool = {
  name: 'system-info',
  description: 'Legge piattaforma, CPU e memoria della macchina server e le riporta al client.',
  run: async (_WS, { status }) => {
    status({ sub_event: 'start', message: 'Raccolta informazioni di sistema...' });
    const info = {
      platform: process.platform,
      arch: process.arch,
      cpus: cpus().length,
      freeMemMB: Math.round(freemem() / 1024 / 1024),
      totalMemMB: Math.round(totalmem() / 1024 / 1024),
      uptimeSeconds: Math.round(uptime()),
    };
    status({ sub_event: 'done', message: JSON.stringify(info, null, 2) });
  },
};
