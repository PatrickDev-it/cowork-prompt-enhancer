# Developer guide

## Toolchain and installation

The supported toolchain is Bun 1.3.12, Node 22.13.0, and Python 3.12.4. Version-manager files and
frozen Bun/Python locks are committed at the repository root.

```bash
bun run install:frozen
```

The command installs the Bun workspace from `bun.lock` and Python dependencies from the
hash-verified `server/modules/requirements-dev.lock`. Regenerate Python locks only after an
intentional dependency change:

```bash
python -m pip install pip==24.2 pip-tools==7.5.0
cd server/modules
python -m piptools compile --generate-hashes -o requirements.lock requirements.txt
python -m piptools compile --generate-hashes -o requirements-dev.lock requirements.txt requirements-dev.txt
```

## Root commands

| Command | Purpose |
|---|---|
| `bun run format` | Format TypeScript, JSON, and Python. |
| `bun run format:check` | Verify formatting without writes. |
| `bun run lint` | Run Biome and Ruff. |
| `bun run typecheck` | Typecheck server and client. |
| `bun run test:unit` | Run Bun and pytest unit suites. |
| `bun run test:integration` | Run integration suites. |
| `bun run test:providers` | Run shared provider conformance and failure contracts. |
| `bun run test:protocol` | Run protocol, authentication, resource and path-adversarial suites. |
| `bun run test:supervisor` | Run deterministic supervisor failure injection. |
| `bun run test:e2e` | Run WebSocket-to-Python mock E2E, remote auth, cancellation and reconnect. |
| `bun run audit` | Audit Bun and Python dependency locks. |
| `bun run preflight` | Validate the selected runtime profile. |
| `bun run demo:mock` | Run the offline deterministic demonstration. |
| `bun run demo:record` | Record the sanitized success, fallback, artifact and benchmark demonstration. |
| `bun run smoke:local` | Start/verify local inference and shut down owned processes. |
| `bun run benchmark` | Execute the versioned evaluation harness. |
| `bun run benchmark:local` | Run the supervised eight-case local-provider reference tier. |
| `bun run docs:check` | Validate tracked Markdown links and local headings. |
| `bun run security:scan` | Reject high-confidence secrets and forbidden heavyweight tracked artifacts. |
| `bun run release:build` | Build the source, evidence, SBOM, inventory and checksum release bundle. |
| `bun run release:validate` | Recompute and validate the generated release bundle. |
| `bun run check` | Run the complete local format/lint/type/test gate. |
| `bun run gate:release` | Run the complete application, audit, documentation, demo and release gate. |

## Development processes

```bash
# Terminal 1
bun --cwd server run dev

# Terminal 2
bun --cwd client run dev
```

Copy `client/.env.example` to `client/.env` only when overriding client connection settings. Never
commit `.env` files. The complete variable reference is in [`environment.md`](environment.md).

## Local GPU artifacts

`server/bin/`, `server/models/*.gguf`, and `server/modules/.venv/` are ignored and never distributed.
Run `setup.ps1` or `setup.sh` for explicit local provisioning, then `bun run preflight`. Versions,
checksums, source links, and license boundaries are recorded in [`../THIRD_PARTY.md`](../THIRD_PARTY.md).

CI validates the offline mock and test doubles on Ubuntu. A local-provider smoke test runs only when
compatible artifacts are present; absence is reported as unsupported, not presented as a passing local
inference result.

## Evaluation evidence

The [`../evaluation/README.md`](../evaluation/README.md) documents the 64-case `cowork-eval/v1`
contract, deterministic rubric, local stratified tier and blinded human-review exchange. The default
benchmark is offline and writes ignored working evidence to `.artifacts/benchmark/mock`. Curated
reference runs under `evaluation/results/` are sanitized release evidence; compiler and fallback
success remain separate in every raw record and aggregate.
