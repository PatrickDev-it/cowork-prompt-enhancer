import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confinePath } from '../../client/events/fileop';
import { $WS, type ConnectionState } from '../../client/lib/ws';
import { decodeServerEnvelope, PROTOCOL_VERSION, type ServerEnvelope } from '../../protocol';
import { createChallengeProof, type SessionChallenge } from '../../server/lib/auth';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function freePort(): Promise<number> {
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('reserved') });
  const port = reservation.port;
  await reservation.stop(true);
  return port;
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await Bun.sleep(20);
  }
}

test('WebSocket -> tool runtime -> Python worker -> mock provider -> confined artifact', async () => {
  const port = await freePort();
  const outputRoot = mkdtempSync(join(tmpdir(), 'cowork-e2e-'));
  const server = Bun.spawn(['bun', 'run', 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      COWORK_PROFILE: 'mock',
      COWORK_HOST: '127.0.0.1',
      COWORK_PORT: String(port),
      COWORK_METRICS: 'true',
      COWORK_PROMPT_ENHANCER_SEARCH: 'off',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let socket: WebSocket | null = null;
  try {
    await waitUntil(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return true;
      } catch {
        return false;
      }
    });

    const messages: ServerEnvelope[] = [];
    socket = new WebSocket(`ws://127.0.0.1:${port}?clientId=e2e-client`, 'client');
    socket.onmessage = (event) => {
      const decoded = decodeServerEnvelope(event.data);
      if (decoded.ok) messages.push(decoded.value);
    };
    await new Promise<void>((resolve, reject) => {
      socket!.onopen = () => resolve();
      socket!.onerror = () => reject(new Error('WebSocket connection failed'));
    });
    await waitUntil(() => messages.some((message) => message.kind === 'event' && message.event === 'session'));

    const capabilitiesId = 'e2e-capabilities';
    socket.send(
      JSON.stringify({
        version: PROTOCOL_VERSION,
        kind: 'command',
        id: capabilitiesId,
        event: 'fileops',
        payload: { uuid: capabilitiesId, payload: { ops: ['write'] } },
      })
    );
    await Bun.sleep(25);

    const commandId = 'e2e-enhancement';
    socket.send(
      JSON.stringify({
        version: PROTOCOL_VERSION,
        kind: 'command',
        id: commandId,
        event: 'prompt-enhancer',
        payload: {
          uuid: commandId,
          payload: { request: 'Build a typed deployment checklist with tests', think: false },
        },
      })
    );

    await waitUntil(
      () =>
        messages.some(
          (message) =>
            message.kind === 'event' &&
            message.event === 'status' &&
            message.id === commandId &&
            (message.payload.payload as { sub_event?: string } | undefined)?.sub_event === 'done'
        ),
      20_000
    );
    const artifactEvent = messages.find(
      (message) => message.kind === 'event' && message.event === 'fileop' && message.id === commandId
    );
    expect(artifactEvent?.kind).toBe('event');
    if (artifactEvent?.kind !== 'event') throw new Error('Artifact event missing');
    const operation = artifactEvent.payload.payload as { path: string; content: string };
    const target = confinePath(outputRoot, operation.path);
    expect(target).not.toBeNull();
    mkdirSync(dirname(target!), { recursive: true });
    writeFileSync(target!, operation.content, 'utf8');
    expect(await Bun.file(target!).text()).toContain('Build a typed deployment checklist with tests');
    expect(messages.some((message) => message.kind === 'error')).toBeFalse();
    let metrics: {
      totals: { requests: number };
      recent: Array<{
        correlationId: string;
        trace: {
          schedulerQueueMs: number;
          compressionMs: number;
          generationMs: number;
          artifactMs: number;
          totalMs: number;
          providerCalls: number;
          generationMode: string;
          fallbackUsed: boolean;
        };
      }>;
    } | null = null;
    await waitUntil(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/metrics`);
      metrics = response.ok ? await response.json() : null;
      return metrics?.totals.requests === 1;
    });
    const trace = metrics!.recent[0]!;
    expect(trace.correlationId).toBe(commandId);
    expect(trace.trace.schedulerQueueMs).toBeGreaterThanOrEqual(0);
    expect(trace.trace.compressionMs).toBeGreaterThanOrEqual(0);
    expect(trace.trace.generationMs).toBeGreaterThanOrEqual(0);
    expect(trace.trace.artifactMs).toBeGreaterThanOrEqual(0);
    expect(trace.trace.totalMs).toBeGreaterThanOrEqual(trace.trace.generationMs);
    expect(trace.trace.providerCalls).toBe(1);
    expect(trace.trace.generationMode).toStartWith('compiler_');
    expect(trace.trace.fallbackUsed).toBeFalse();
  } finally {
    socket?.close();
    server.kill();
    await server.exited;
    rmSync(outputRoot, { recursive: true, force: true });
  }
}, 30_000);

async function connect(url: string): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, 'client');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket upgrade timed out'));
    }, 3_000);
    socket.onopen = () => {
      clearTimeout(timeout);
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket upgrade rejected'));
    };
  });
}

test('non-loopback operation rejects anonymous and replayed upgrades while accepting one valid challenge', async () => {
  const port = await freePort();
  const secret = 'integration-auth-secret-1234567890';
  const server = Bun.spawn(['bun', 'run', 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      COWORK_PROFILE: 'mock',
      COWORK_HOST: '0.0.0.0',
      COWORK_PORT: String(port),
      COWORK_ALLOW_REMOTE: 'true',
      COWORK_AUTH_SECRET: secret,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let authenticated: WebSocket | null = null;
  let proof = '';
  try {
    await waitUntil(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return true;
      } catch {
        return false;
      }
    });
    await expect(connect(`ws://127.0.0.1:${port}?clientId=anonymous-client`)).rejects.toThrow('rejected');

    const clientId = 'authenticated-client';
    const response = await fetch(`http://127.0.0.1:${port}/auth/challenge?clientId=${clientId}`);
    expect(response.ok).toBeTrue();
    const challenge = (await response.json()) as SessionChallenge;
    proof = createChallengeProof(secret, challenge, clientId);
    const authenticatedUrl = `ws://127.0.0.1:${port}?${new URLSearchParams({
      clientId,
      challenge: challenge.id,
      proof,
    })}`;
    authenticated = await connect(authenticatedUrl);
    authenticated.close();
    authenticated = null;
    await expect(connect(authenticatedUrl)).rejects.toThrow('rejected');
  } finally {
    authenticated?.close();
    server.kill();
    await server.exited;
    const output = `${await new Response(server.stdout).text()}${await new Response(server.stderr).text()}`;
    expect(output).not.toContain(secret);
    if (proof) expect(output).not.toContain(proof);
  }
}, 20_000);

test('cancellation terminates the delayed Python/provider request and returns a stable error', async () => {
  const port = await freePort();
  const server = Bun.spawn(['bun', 'run', 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      COWORK_PROFILE: 'mock',
      COWORK_MOCK_DELAY_MS: '5000',
      COWORK_HOST: '127.0.0.1',
      COWORK_PORT: String(port),
      COWORK_PROMPT_ENHANCER_SEARCH: 'off',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let socket: WebSocket | null = null;
  try {
    await waitUntil(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return true;
      } catch {
        return false;
      }
    });
    socket = await connect(`ws://127.0.0.1:${port}?clientId=cancellation-client`);
    const messages: ServerEnvelope[] = [];
    socket.onmessage = (event) => {
      const decoded = decodeServerEnvelope(event.data);
      if (decoded.ok) messages.push(decoded.value);
    };
    const commandId = 'cancel-provider-command';
    socket.send(
      JSON.stringify({
        version: PROTOCOL_VERSION,
        kind: 'command',
        id: commandId,
        event: 'prompt-enhancer',
        payload: { uuid: commandId, payload: { request: 'This request will be cancelled', think: false } },
      })
    );
    await waitUntil(() =>
      messages.some(
        (message) =>
          message.kind === 'event' &&
          message.event === 'status' &&
          (message.payload.payload as { sub_event?: string } | undefined)?.sub_event === 'start'
      )
    );
    const cancelledAt = performance.now();
    socket.send(JSON.stringify({ version: PROTOCOL_VERSION, kind: 'cancel', id: commandId }));
    await waitUntil(
      () =>
        messages.some(
          (message) => message.kind === 'error' && message.id === commandId && message.code === 'cancelled'
        ),
      2_000
    );
    expect(performance.now() - cancelledAt).toBeLessThan(2_000);
  } finally {
    socket?.close();
    server.kill();
    await server.exited;
  }
}, 15_000);

test('client reconnects after server restart without replaying a completed command', async () => {
  const port = await freePort();
  const spawnServer = () =>
    Bun.spawn(['bun', 'run', 'server/index.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        COWORK_PROFILE: 'mock',
        COWORK_HOST: '127.0.0.1',
        COWORK_PORT: String(port),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  let server = spawnServer();
  let client: $WS | null = null;
  try {
    await waitUntil(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return true;
      } catch {
        return false;
      }
    });
    const states: ConnectionState[] = [];
    const terminal: string[] = [];
    client = new $WS(`ws://127.0.0.1:${port}`, 'client', {
      clientId: 'restart-client',
      reconnectBaseMs: 25,
      reconnectMaxMs: 200,
      maxReconnectAttempts: 20,
      random: () => 0.5,
    });
    client.onState((state) => states.push(state));
    client.on('status', (message) => {
      const payload = message.payload as { sub_event?: string } | undefined;
      if (payload?.sub_event === 'done') terminal.push(String(message.uuid));
    });
    await client.ready();
    const commandId = 'completed-before-restart';
    client.emit('system-info', { uuid: commandId, payload: {} });
    await waitUntil(() => terminal.includes(commandId));

    server.kill();
    await server.exited;
    await waitUntil(() => states.includes('reconnecting'));
    server = spawnServer();
    await waitUntil(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return true;
      } catch {
        return false;
      }
    });
    await waitUntil(() => states.filter((state) => state === 'ready').length >= 2, 5_000);
    await Bun.sleep(300);
    expect(terminal.filter((id) => id === commandId)).toHaveLength(1);
  } finally {
    client?.close();
    server.kill();
    await server.exited;
  }
}, 20_000);
