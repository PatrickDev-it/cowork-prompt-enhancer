import chalk from 'chalk';
import { AUTH_SECRET, CLIENT_ID, IP, PORT } from '@/config';
import { handleFileop } from '@/events/fileop';
import { handlePrompt } from '@/events/prompt';
import { handleSession } from '@/events/session';
import { handleStatus } from '@/events/status';
import { ensureIODirs } from '@/lib/io';
import { $WS } from '@/lib/ws';

ensureIODirs();

const WS = new $WS(`ws://${IP}:${PORT}`, 'client', {
  authSecret: AUTH_SECRET || undefined,
  clientId: CLIENT_ID,
});

WS.onState((state) => console.log(`Connection state: ${state}`));

WS.on('init', (props) => WS.emit('init', props));
WS.on('status', (props) => handleStatus(props));
WS.on('session', (props) => handleSession(WS, props));
WS.on('fileop', (props) => {
  const result = handleFileop(props);
  if (!result.ok && typeof props.uuid === 'string') {
    WS.emit('fileop-result', { uuid: props.uuid, payload: result });
  }
});
// A prompt failure happens before a tool is invoked, so the tool runtime cannot perform its menu loop-back.
WS.on('prompt', async (props) => {
  try {
    await handlePrompt(WS, props);
  } catch (err) {
    console.error(chalk.red(`Prompt failed: ${err instanceof Error ? err.message : String(err)}`));
  }
});

console.log(`Connecting to ws://${IP}:${PORT}...`);
