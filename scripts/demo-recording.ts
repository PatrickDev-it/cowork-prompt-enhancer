import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const decoder = new TextDecoder();
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function sanitize(value: string): string {
  return value
    .replaceAll(root, '<repo>')
    .replaceAll(root.replaceAll('\\', '/'), '<repo>')
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
    .replace(ansiPattern, '')
    .trim();
}

function step(command: string, args: string[], env: Record<string, string> = {}): string {
  const result = Bun.spawnSync(args, {
    cwd: root,
    env: { ...process.env, ...env, NO_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = sanitize(decoder.decode(result.stdout));
  const stderr = sanitize(decoder.decode(result.stderr));
  if (result.exitCode !== 0) throw new Error(`${command} failed: ${stderr || stdout}`);
  return [`$ ${command}`, stdout, stderr].filter(Boolean).join('\n');
}

const request = 'Build a typed task API with validation, cancellation, and tests';
const transcript = [
  '# Prompt Enhancer - reproducible terminal demo',
  '',
  step('bun run preflight', ['bun', 'run', 'preflight'], { COWORK_PROFILE: 'mock' }),
  '',
  step(`bun run demo:mock "${request}"`, ['bun', 'run', 'demo:mock', request], {
    COWORK_PROFILE: 'mock',
    COWORK_MOCK_SCENARIO: 'success',
  }),
  '',
  step(`COWORK_MOCK_SCENARIO=malformed bun run demo:mock "${request}"`, ['bun', 'run', 'demo:mock', request], {
    COWORK_PROFILE: 'mock',
    COWORK_MOCK_SCENARIO: 'malformed',
  }),
  '',
  step('bun run benchmark', ['bun', 'run', 'benchmark'], { COWORK_PROFILE: 'mock' }),
  '',
].join('\n');

const outputDir = join(root, '.artifacts', 'demo');
await mkdir(outputDir, { recursive: true });
const output = join(outputDir, 'terminal-demo.txt');
await Bun.write(output, transcript);
console.log(`Sanitized demo transcript: ${output}`);
