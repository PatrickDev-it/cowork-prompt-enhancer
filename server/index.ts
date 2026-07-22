import { randomUUIDv7 } from 'bun';
import { assertValidConfig, PORT, PROFILE } from '@/config';
import { init } from '@/events/init';
import { openSession } from '@/events/session';
import { $WSWrapper, type SocketData } from '@/lib/ws';
import { startLlm } from '@/modules/llm';
import { warmUpPromptEnhancer } from '@/modules/prompt_enhancer';
import { tools } from '@/tools';
import { registerTool } from '@/tools/runtime';

// Avvia l'infra LLM condivisa (llama-server) subito, in background — RFC-0014/0015. Non blocca
// Bun.serve: il server accetta connessioni da subito, il modello sarà pronto in VRAM per la prima
// invocazione (che comunque attende `/health` se non lo è ancora). Il modello è condiviso da tutti
// i moduli (prompt_enhancer, context_compressor, futuri). `warmUpPromptEnhancer` avvia il suo worker.
assertValidConfig();
if (PROFILE === 'local') startLlm();
warmUpPromptEnhancer();

Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const upgraded = server.upgrade(req, {
      data: {
        role: req.headers.get('Sec-WebSocket-Protocol'),
        uuid: randomUUIDv7(),
      },
    });
    if (upgraded) return;
    return new Response('🤑 Sometimes you just need to mind your own business 🤑', { status: 404 });
  },
  websocket: $WSWrapper({
    open: (WS) => {
      openSession(WS);
      for (const tool of Object.values(tools)) registerTool(WS, tool);
      WS.on('init', () => init(WS));
      init(WS);
    },
  }),
});

console.log(`Cowork server listening on ws://localhost:${PORT} (${PROFILE}) — ${Object.keys(tools).length} tools.`);
