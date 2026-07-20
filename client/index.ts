import chalk from 'chalk';
import { IP, PORT } from '@/config';
import { handleFileop } from '@/events/fileop';
import { handlePrompt } from '@/events/prompt';
import { handleSession } from '@/events/session';
import { handleStatus } from '@/events/status';
import { ensureIODirs } from '@/lib/io';
import { $WS } from '@/lib/ws';

ensureIODirs();

const WS = new $WS(`ws://${IP}:${PORT}`, 'client');

WS.on('init', (props) => WS.emit('init', props));
WS.on('status', (props) => handleStatus(props));
WS.on('session', (props) => handleSession(WS, props));
WS.on('fileop', (props) => handleFileop(props));
// try/catch esplicito: un prompt che fallisce (es. `file-select` su cartella vuota, RFC-0009 § 2)
// avviene prima che un tool sia invocato, quindi non c'è loop-back automatico da tools/runtime.ts.
WS.on('prompt', async (props) => {
  try {
    await handlePrompt(WS, props);
  } catch (err) {
    console.error(chalk.red(`Errore nel prompt: ${err instanceof Error ? err.message : String(err)}`));
  }
});

console.log(`Connesso a ws://${IP}:${PORT}, in attesa del menu...`);
