import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { scanRepository } from './secret-scan';

export interface DependencyComponent {
  ecosystem: 'npm' | 'pypi';
  name: string;
  version: string;
  source: string;
}

interface ReleaseOptions {
  version: string;
  output: string;
  ref?: string;
  requireClean?: boolean;
}

const root = resolve(import.meta.dir, '..');
const decoder = new TextDecoder();

function run(args: string[]): string {
  const result = Bun.spawnSync(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(decoder.decode(result.stderr).trim() || `${args[0]} failed`);
  return decoder.decode(result.stdout).trim();
}

function parseIdentity(identity: string): { name: string; version: string } | null {
  const separator = identity.lastIndexOf('@');
  if (separator < 1) return null;
  const name = identity.slice(0, separator);
  const version = identity.slice(separator + 1);
  if (!name || !version || version.startsWith('workspace:')) return null;
  return { name, version };
}

export function parseBunLock(source: string): DependencyComponent[] {
  const found = new Map<string, DependencyComponent>();
  for (const match of source.matchAll(/^\s*"[^"]+": \["([^"]+)"/gm)) {
    const parsed = parseIdentity(match[1] ?? '');
    if (!parsed) continue;
    const key = `${parsed.name}@${parsed.version}`;
    found.set(key, { ecosystem: 'npm', ...parsed, source: 'bun.lock' });
  }
  return [...found.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

export function parsePythonLock(source: string): DependencyComponent[] {
  const found = new Map<string, DependencyComponent>();
  for (const match of source.matchAll(/^([A-Za-z0-9_.-]+)==([^\s\\]+)\s*\\?$/gm)) {
    const name = (match[1] ?? '').toLowerCase().replaceAll('_', '-');
    const version = match[2] ?? '';
    if (name && version)
      found.set(`${name}@${version}`, { ecosystem: 'pypi', name, version, source: 'requirements-dev.lock' });
  }
  return [...found.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

function purl(component: DependencyComponent): string {
  if (component.ecosystem === 'pypi') return `pkg:pypi/${encodeURIComponent(component.name)}@${component.version}`;
  const npmName = component.name.startsWith('@')
    ? `%40${component.name.slice(1).split('/').map(encodeURIComponent).join('/')}`
    : encodeURIComponent(component.name);
  return `pkg:npm/${npmName}@${component.version}`;
}

function assertVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
}

function releaseRoot(output: string): string {
  const allowedRoot = resolve(root, '.artifacts', 'release');
  const resolved = resolve(root, output);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${sep}`)) {
    throw new Error('Release output must remain under .artifacts/release');
  }
  return resolved;
}

async function checksum(file: string): Promise<string> {
  return new Bun.CryptoHasher('sha256').update(await Bun.file(file).arrayBuffer()).digest('hex');
}

async function outputFiles(output: string): Promise<string[]> {
  return (await readdir(output, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function buildRelease(options: ReleaseOptions): Promise<string> {
  assertVersion(options.version);
  const output = releaseRoot(options.output);
  const ref = options.ref ?? 'HEAD';
  if (options.requireClean !== false && run(['git', 'status', '--porcelain'])) {
    throw new Error('Release builds require a clean Git worktree');
  }
  const findings = scanRepository(root);
  if (findings.length) throw new Error(`Release blocked by ${findings.length} secret or forbidden-artifact finding(s)`);

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { version?: string };
  if (packageJson.version !== options.version) {
    throw new Error(`package.json version ${packageJson.version ?? 'missing'} does not match ${options.version}`);
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const commit = run(['git', 'rev-parse', `${ref}^{commit}`]);
  const commitTimestamp = run(['git', 'show', '-s', '--format=%cI', commit]);
  const prefix = `ai-prompt-optimizer-${options.version}`;
  run([
    'git',
    'archive',
    '--format=tar.gz',
    `--prefix=${prefix}/`,
    `--output=${resolve(output, `${prefix}-source.tar.gz`)}`,
    commit,
  ]);
  run([
    'git',
    'archive',
    '--format=tar.gz',
    `--output=${resolve(output, `${prefix}-benchmark-evidence.tar.gz`)}`,
    commit,
    'evaluation/results',
  ]);

  const copies: Array<[string, string]> = [
    ['CHANGELOG.md', `${prefix}-CHANGELOG.md`],
    ['THIRD_PARTY.md', `${prefix}-THIRD-PARTY.md`],
    ['LICENSE', `${prefix}-LICENSE.txt`],
    ['evaluation/results/mock-full-v1/report.md', `${prefix}-benchmark-mock.md`],
    ['evaluation/results/local-stratified-v1/report.md', `${prefix}-benchmark-local.md`],
  ];
  for (const [source, destination] of copies) await copyFile(resolve(root, source), resolve(output, destination));

  const dependencies = [
    ...parseBunLock(await readFile(resolve(root, 'bun.lock'), 'utf8')),
    ...parsePythonLock(await readFile(resolve(root, 'server/modules/requirements-dev.lock'), 'utf8')),
  ];
  const inventory = {
    schemaVersion: 1,
    project: 'PatrickDev-it/ai-prompt-optimizer',
    version: options.version,
    commit,
    generatedFrom: ['bun.lock', 'server/modules/requirements-dev.lock'],
    components: dependencies,
  };
  await writeFile(resolve(output, `${prefix}-dependency-inventory.json`), `${JSON.stringify(inventory, null, 2)}\n`);

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp: commitTimestamp,
      component: { type: 'application', name: 'ai-prompt-optimizer', version: options.version },
    },
    components: dependencies.map((dependency) => ({
      type: 'library',
      name: dependency.name,
      version: dependency.version,
      purl: purl(dependency),
      properties: [{ name: 'cowork:source-lock', value: dependency.source }],
    })),
  };
  await writeFile(resolve(output, `${prefix}-sbom.cdx.json`), `${JSON.stringify(sbom, null, 2)}\n`);

  const manifest = {
    schemaVersion: 1,
    project: 'PatrickDev-it/ai-prompt-optimizer',
    version: options.version,
    commit,
    commitTimestamp,
    providerArtifactsIncluded: false,
    benchmarkVersion: 'cowork-eval/v1',
    humanEvaluationClaimed: false,
  };
  await writeFile(resolve(output, `${prefix}-release-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);

  const files = await outputFiles(output);
  const checksums = await Promise.all(files.map(async (file) => `${await checksum(resolve(output, file))}  ${file}`));
  await writeFile(resolve(output, 'CHECKSUMS.sha256'), `${checksums.join('\n')}\n`);
  await validateRelease(output, options.version);
  return output;
}

export async function validateRelease(outputOption: string, version: string): Promise<void> {
  assertVersion(version);
  const output = releaseRoot(outputOption);
  const prefix = `ai-prompt-optimizer-${version}`;
  const required = [
    'CHECKSUMS.sha256',
    `${prefix}-source.tar.gz`,
    `${prefix}-benchmark-evidence.tar.gz`,
    `${prefix}-CHANGELOG.md`,
    `${prefix}-THIRD-PARTY.md`,
    `${prefix}-LICENSE.txt`,
    `${prefix}-benchmark-mock.md`,
    `${prefix}-benchmark-local.md`,
    `${prefix}-dependency-inventory.json`,
    `${prefix}-sbom.cdx.json`,
    `${prefix}-release-manifest.json`,
  ];
  const present = new Set(await outputFiles(output));
  const missing = required.filter((file) => !present.has(file));
  if (missing.length) throw new Error(`Release is missing: ${missing.join(', ')}`);

  const lines = (await readFile(resolve(output, 'CHECKSUMS.sha256'), 'utf8')).trim().split('\n');
  const covered = new Set<string>();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line.trim());
    if (!match) throw new Error(`Malformed checksum line: ${line}`);
    const file = match[2] ?? '';
    if (!present.has(file)) throw new Error(`Checksum references missing file: ${file}`);
    if (covered.has(file)) throw new Error(`Duplicate checksum entry: ${file}`);
    covered.add(file);
    if ((await checksum(resolve(output, file))) !== match[1]) throw new Error(`Checksum mismatch: ${file}`);
  }
  const uncovered = [...present].filter((file) => file !== 'CHECKSUMS.sha256' && !covered.has(file));
  if (uncovered.length) throw new Error(`Release files lack checksums: ${uncovered.join(', ')}`);
}

function option(name: string): string | undefined {
  const equals = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (equals) return equals.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const version = option('version') ?? '1.0.0';
  const output = option('output') ?? `.artifacts/release/v${version}`;
  if (process.argv.includes('--validate-only')) {
    await validateRelease(output, version);
    console.log(`Release valid: ${relative(root, resolve(root, output))}`);
  } else {
    const built = await buildRelease({ version, output });
    console.log(`Release built and validated: ${relative(root, built)}`);
    console.log(`Artifacts: ${(await outputFiles(built)).length}`);
  }
}
