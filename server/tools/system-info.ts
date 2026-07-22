import { cpus, freemem, totalmem, uptime } from 'node:os';
import type { Tool } from './types';

/** Synchronous tool smoke test without additional prompts (RFC-0003 § 5). */
export const systemInfo: Tool = {
  name: 'system-info',
  description: 'Report the server platform, CPU count, memory, and uptime.',
  run: async (_WS, { status }) => {
    status({ sub_event: 'start', message: 'Collecting system information...' });
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
