# Developer notes

This is a two-package workspace (`client/`, `server/`), each with its own `package.json` — there is
no root `package.json`. Run each command from inside the relevant package directory.

## Running

```bash
# server (also supervises the llama-server child process — see server/modules/llm/supervisor.ts)
cd server && bun install && bun run dev

# client (CLI)
cd client && bun install && cp .env.example .env && bun run dev
```

## Typecheck

```bash
cd server && bun run typecheck   # tsc --noEmit
cd client && bun run typecheck
```

## Lint / format

```bash
# TypeScript (client/ and server/) — Biome
bunx @biomejs/biome check .
bunx @biomejs/biome check --write .   # auto-fix

# Python (server/modules/prompt_enhancer) — Ruff
cd server/modules
ruff check prompt_enhancer
ruff format prompt_enhancer
```

## Tests

```bash
# TypeScript — bun test
cd server && bun test
cd client && bun test

# Python — pytest, against the prompt_enhancer module only
cd server/modules
pip install -r requirements.txt -r requirements-dev.txt
pytest prompt_enhancer
```

CI (`.github/workflows/ci.yml`) runs all of the above on `ubuntu-latest`. It validates the
TypeScript/Python logic only — the GPU inference path (`llama-server.exe` + vendored CUDA DLLs) is
Windows-only and out of CI's reach by design (see RFC-0025).

## Vendored GPU stack

`server/bin/` (llama-server binary + CUDA DLLs), `server/models/*.gguf`, and
`server/modules/.venv/` are git-ignored — they are not part of this repository and are not
committed. Until RFC-0025 Phase 3 (a `setup.ps1`/`setup.sh` provisioning script) lands, provisioning
them is manual: build or download a matching `llama-server` release for your platform into
`server/bin/`, place a compatible `.gguf` (this project targets Qwen3-8B, quantized) in
`server/models/`, and create the shared venv at `server/modules/.venv` with
`server/modules/requirements.txt` installed.
