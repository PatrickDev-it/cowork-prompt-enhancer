import { platform, release } from 'node:os';
import {
  LLAMA_SERVER_BIN,
  LLAMA_SERVER_URL,
  PROFILE,
  PROMPT_MODEL_PATH,
  assertValidConfig,
} from '../src/server/config';

async function version(command: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const proc = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    if ((await proc.exited) !== 0) return null;
    return (output || error).trim().split(/\r?\n/, 1)[0] ?? null;
  } catch {
    return null;
  }
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest('hex');
}

const failures: string[] = [];
try {
  assertValidConfig();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

const gpu = await version('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader']);
const capabilities =
  PROFILE === 'mock'
    ? ['offline', 'deterministic', 'failure-injection', 'structured-output']
    : ['chat-completions', 'structured-output', 'timeouts', 'typed-errors'];

async function health(): Promise<string> {
  if (PROFILE === 'mock') return 'healthy';
  const baseUrl = PROFILE === 'local' ? LLAMA_SERVER_URL : process.env.COWORK_OPENAI_BASE_URL!;
  const headers =
    PROFILE === 'openai-compatible' ? { Authorization: `Bearer ${process.env.COWORK_OPENAI_API_KEY!}` } : undefined;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return 'healthy';
    if (PROFILE === 'local') return `supervisor-managed (endpoint returned HTTP ${response.status})`;
    failures.push(`OpenAI-compatible provider health check returned HTTP ${response.status}`);
  } catch {
    if (PROFILE === 'local') return 'supervisor-managed (endpoint not running)';
    failures.push('OpenAI-compatible provider health check failed; verify URL, network access, and credential');
  }
  return 'unhealthy';
}

const providerHealth = failures.length === 0 ? await health() : 'configuration-invalid';
const report: Record<string, unknown> = {
  ok: failures.length === 0,
  os: `${platform()} ${release()}`,
  runtimes: {
    bun: Bun.version,
    node: await version('node'),
    python: await version(process.platform === 'win32' ? 'python' : 'python3'),
  },
  profile: PROFILE,
  provider: { profile: PROFILE, health: providerHealth, capabilities },
  model:
    PROFILE === 'mock'
      ? 'cowork-deterministic-v1'
      : PROFILE === 'openai-compatible'
        ? process.env.COWORK_OPENAI_MODEL
        : PROMPT_MODEL_PATH,
  gpu: gpu ?? 'not detected',
  failures,
};

if (PROFILE === 'local' && failures.length === 0) {
  report.local = {
    executable: LLAMA_SERVER_BIN,
    executable_sha256: await sha256(LLAMA_SERVER_BIN),
    model: PROMPT_MODEL_PATH,
    model_sha256: await sha256(PROMPT_MODEL_PATH),
  };
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
