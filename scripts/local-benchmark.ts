import { dirname, join } from 'node:path';
import {
  LLAMA_SERVER_BIN,
  LLAMA_SERVER_URL,
  PROFILE,
  PROMPT_MODEL_PATH,
  assertValidConfig,
  llamaServerArgs,
} from '../src/server/config';

if (PROFILE !== 'local') throw new Error('Set COWORK_PROFILE=local to run the local benchmark');
assertValidConfig();

const ROOT = join(import.meta.dir, '..');

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
  const benchmark = Bun.spawn(
    [
      python,
      'evaluation/benchmark.py',
      '--profile',
      'local',
      '--tier',
      'stratified',
      '--strategies',
      'raw,thin,compiler,field_loop',
      '--output',
      '.artifacts/benchmark/local',
      '--overwrite',
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        COWORK_PROFILE: 'local',
        COWORK_PROMPT_MODEL: PROMPT_MODEL_PATH,
        COWORK_PROMPT_ENHANCER_SEARCH: 'off',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );
  const exitCode = await benchmark.exited;
  if (exitCode !== 0) throw new Error(`Local benchmark failed with code ${exitCode}`);
} finally {
  owned?.kill();
  if (owned) await owned.exited;
}
