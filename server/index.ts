import { randomUUIDv7 } from 'bun';
import {
  ALLOW_REMOTE,
  AUTH_SECRET,
  HOST,
  MAX_FRAME_BYTES,
  PORT,
  PROFILE,
  assertValidConfig,
  isLoopbackHost,
} from '@/config';
import { init } from '@/events/init';
import { openSession } from '@/events/session';
import { ChallengeStore } from '@/lib/auth';
import { $WSWrapper, type SocketData } from '@/lib/ws';
import { startLlm } from '@/modules/llm';
import { warmUpPromptEnhancer } from '@/modules/prompt_enhancer';
import { tools } from '@/tools';
import { bindScheduler, cancelSessionCommands, registerTool } from '@/tools/runtime';

assertValidConfig();
if (PROFILE === 'local') startLlm();
warmUpPromptEnhancer();

const remoteBinding = !isLoopbackHost(HOST);
const challenges = new ChallengeStore(AUTH_SECRET);
const clientIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

Bun.serve<SocketData>({
  hostname: HOST,
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/auth/challenge') {
      if (!remoteBinding || !ALLOW_REMOTE) return jsonError(404, 'not_found');
      const clientId = url.searchParams.get('clientId') ?? '';
      if (!clientIdPattern.test(clientId)) return jsonError(400, 'invalid_client_id');
      return Response.json(challenges.issue(), { headers: { 'Cache-Control': 'no-store' } });
    }

    const requestedClientId = url.searchParams.get('clientId') ?? '';
    const clientId = clientIdPattern.test(requestedClientId) ? requestedClientId : randomUUIDv7();
    if (remoteBinding) {
      if (!clientIdPattern.test(requestedClientId)) return jsonError(401, 'authentication_required');
      const challenge = url.searchParams.get('challenge') ?? '';
      const proof = url.searchParams.get('proof') ?? '';
      const verified = challenges.verify(challenge, clientId, proof);
      if (!verified.ok) return jsonError(401, verified.code);
    }

    const upgraded = server.upgrade(req, {
      data: {
        role: req.headers.get('Sec-WebSocket-Protocol'),
        uuid: randomUUIDv7(),
        clientId,
      },
    });
    if (upgraded) return;
    return jsonError(404, 'not_found');
  },
  websocket: {
    ...$WSWrapper({
      open: (WS) => {
        bindScheduler(WS);
        openSession(WS);
        for (const tool of Object.values(tools)) registerTool(WS, tool);
        WS.on('init', () => init(WS));
        init(WS);
      },
      close: (WS) => cancelSessionCommands(WS),
    }),
    maxPayloadLength: MAX_FRAME_BYTES,
  },
});

console.log(
  `Cowork server listening on ws://${HOST}:${PORT} (${PROFILE}, ${remoteBinding ? 'authenticated remote' : 'loopback'}) — ${Object.keys(tools).length} tools.`
);
