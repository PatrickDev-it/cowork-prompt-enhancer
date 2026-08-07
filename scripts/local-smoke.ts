import { dirname } from 'node:path';
import {
  LLAMA_SERVER_BIN,
  LLAMA_SERVER_URL,
  PROFILE,
  PROMPT_ENHANCER_DIR,
  assertValidConfig,
  llamaServerArgs,
} from '../src/server/config';

if (PROFILE !== 'local') throw new Error('Set COWORK_PROFILE=local to run the local-provider smoke test');
assertValidConfig();

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    return response.ok && ((await response.json()) as { status?: string }).status === 'ok';
  } catch {
    return false;
  }
}

let owned: Bun.Subprocess | null = null;
try {
  if (!(await healthy())) {
    owned = Bun.spawn([LLAMA_SERVER_BIN, ...llamaServerArgs()], {
      cwd: dirname(LLAMA_SERVER_BIN),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    const deadline = Date.now() + 120_000;
    while (!(await healthy())) {
      if (Date.now() >= deadline) throw new Error('llama-server did not become healthy within 120 seconds');
      if (owned.exitCode !== null) throw new Error(`llama-server exited during startup with code ${owned.exitCode}`);
      await Bun.sleep(500);
    }
  }

  const python = process.env.COWORK_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const worker = Bun.spawn([python, 'cli.py', '--prompt', 'Write a two-line deployment checklist'], {
    cwd: PROMPT_ENHANCER_DIR,
    env: { ...process.env, COWORK_PROFILE: 'local', COWORK_PROMPT_ENHANCER_SEARCH: 'off' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = setTimeout(() => worker.kill(), 180_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  clearTimeout(timeout);
  if (exitCode !== 0) throw new Error(`Local worker failed: ${stderr.trim().slice(0, 500)}`);
  const result = JSON.parse(stdout.trim()) as { prompt?: unknown };
  if (typeof result.prompt !== 'string' || result.prompt.length < 20)
    throw new Error('Local provider returned no prompt');
  console.log(JSON.stringify({ ok: true, profile: 'local', endpoint: LLAMA_SERVER_URL, generated: true }, null, 2));
} finally {
  owned?.kill();
  if (owned) await owned.exited;
}
