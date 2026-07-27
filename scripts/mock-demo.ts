import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const request = process.argv.slice(2).join(' ').trim() || 'Build a typed task API with validation and tests';
const python = process.env.COWORK_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const moduleDir = join(import.meta.dir, '..', 'server', 'modules', 'prompt_enhancer');
const processResult = Bun.spawnSync([python, 'cli.py', '--prompt', request], {
  cwd: moduleDir,
  env: {
    ...process.env,
    COWORK_PROFILE: 'mock',
    COWORK_MOCK_SCENARIO: process.env.COWORK_MOCK_SCENARIO ?? 'success',
    COWORK_PROMPT_ENHANCER_SEARCH: 'off',
  },
  stdout: 'pipe',
  stderr: 'pipe',
});

if (processResult.exitCode !== 0) {
  const detail = new TextDecoder().decode(processResult.stderr).trim();
  throw new Error(`Mock demo failed: ${detail}`);
}

const raw = new TextDecoder().decode(processResult.stdout).trim();
const result = JSON.parse(raw) as {
  prompt?: unknown;
  research?: unknown;
  debug?: { generation_mode?: unknown };
};
if (typeof result.prompt !== 'string' || !result.prompt.trim()) throw new Error('Mock demo returned no prompt');
const scenario = process.env.COWORK_MOCK_SCENARIO ?? 'success';
const generationMode = typeof result.debug?.generation_mode === 'string' ? result.debug.generation_mode : 'unknown';
const fallbackUsed = generationMode === 'single_generic_prompt_template';

const outputDir = join(import.meta.dir, '..', 'demo-output');
await mkdir(outputDir, { recursive: true });
const artifact = join(outputDir, 'prompt.md');
await Bun.write(artifact, `${result.prompt.trim()}\n`);

console.log('Prompt Enhancer — deterministic offline demo');
console.log(`Request: ${request}`);
console.log(`Scenario: ${scenario}`);
console.log(`Generation mode: ${generationMode}`);
console.log(`Fallback used: ${fallbackUsed}`);
console.log(`Artifact: ${artifact}`);
console.log('');
console.log(result.prompt.trim());
