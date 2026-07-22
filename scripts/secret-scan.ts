import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SecretFinding {
  file: string;
  rule: string;
}

const forbiddenPath =
  /(^|\/)(?:node_modules|\.venv|venv|demo-output)(?:\/|$)|\.(?:gguf|safetensors|onnx|pt|pth|exe|dll|dylib|so|com|msi|pem|key|p12|pfx)$/i;
const secretRules: Array<[string, RegExp]> = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /(?:github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{30,})/],
  ['openai-token', /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/],
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
];

export function trackedFiles(root: string): string[] {
  const result = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim());
  return new TextDecoder().decode(result.stdout).split('\0').filter(Boolean);
}

export function scanText(file: string, text: string): SecretFinding[] {
  return secretRules.filter(([, pattern]) => pattern.test(text)).map(([rule]) => ({ file, rule }));
}

export function scanRepository(root = resolve(import.meta.dir, '..')): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of trackedFiles(root)) {
    const normalized = file.replaceAll('\\', '/');
    const name = normalized.split('/').at(-1) ?? '';
    if (forbiddenPath.test(normalized) || (name.startsWith('.env') && name !== '.env.example')) {
      findings.push({ file: normalized, rule: 'forbidden-artifact' });
      continue;
    }
    const bytes = readFileSync(resolve(root, file));
    if (bytes.byteLength > 10 * 1024 * 1024) {
      findings.push({ file: normalized, rule: 'oversized-artifact' });
      continue;
    }
    if (bytes.includes(0)) continue;
    findings.push(...scanText(normalized, bytes.toString('utf8')));
  }
  return findings;
}

if (import.meta.main) {
  const findings = scanRepository();
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.file}: ${finding.rule}`);
    process.exit(1);
  }
  console.log('Secret and heavyweight-artifact scan passed.');
}
