# Handoff

Living project context — not a changelog. Rewritten in full (not appended) on every patch, as if a senior engineer were handing the work off to the next one.

## Where we are

Cowork is a working local LLM infrastructure (Bun/TS WS server + CLI client + supervised
`llama-server` + Python `prompt_enhancer` compiler) with genuinely senior-level engineering
underneath it — but it currently lives only as a local working directory: **not a git repository**,
no README/LICENSE anywhere, zero automated tests, no CI. RFC-0025
(`.sinapsi/rfc/0025-repository-launch-and-portfolio-readiness.md`) is the accepted plan for taking
it from "local folder" to "public, verifiable, presentable repository" for portfolio purposes
(target audiences: Google/Microsoft/bank-style technical hiring loops).

## What is complete

- The audit itself (findings folded into RFC-0025's Context section — no separate doc).
- RFC-0025 written and committed to `.sinapsi/rfc/`, status **Proposed**.

## What remains

Nothing from RFC-0025 has been executed yet. In order:
- **Phase 0** (~1 day): `git init` with staged/logical commit history, secret sweep on
  `client/.env`, `LICENSE` (MIT), root `README.md` skeleton.
- **Phase 1** (2-3 days): `pytest` for `workflow.py`'s pure coercion/parsing functions, `bun test`
  for the tool registry/fs-capability/compression-recursion logic, GitHub Actions CI
  (`ubuntu-latest`, explicitly not covering the Windows/CUDA path), Biome + Ruff, a *scoped*
  English-translation pass (module docstrings only, not every historical comment).
- **Phase 2** (3-5 days): `docs/architecture.md` with sequence + component diagrams and an explicit
  threat-model section, backfilling 6 specific RFCs (0002, 0008, 0014, 0015, 0018, 0024) labeled as
  retroactive reconstructions with sources cited, splitting `workflow.py` (915 lines) into
  `prompts.py`/`coercion.py`/`strategies.py`/thin `workflow.py` — only after Phase 1's tests exist,
  and a recorded CLI demo embedded in the README.
- **Phase 3** (stretch, 2-4 days): a `providers/openai_compatible.py` implementing the existing
  `LLMProvider` Protocol so the project runs without the ~7.9GB local/GPU stack.

## What is fragile

- `workflow.py` is the hub of the whole module (915 lines, 32 graph connections) — any edit to it
  before Phase 1's tests land is unverified by anything but manual reading.
- `run_enhancement_field_loop` must not be altered (RFC-0005 § crit. 4, restated in RFC-0025's
  Non-goals) — it is the safety net every other strategy falls back to.
- The vendored GPU stack (`server/bin/`, `server/models/*.gguf`, `server/modules/.venv/`) is
  correctly `.gitignore`d already; don't second-guess that during Phase 0, it was verified correct
  during the audit.

## What to avoid

- Don't backdate the Phase-2 backfilled RFCs as if they were written contemporaneously with the
  decisions they describe — RFC-0025 Decision § 5 requires them labeled as reconstructions with
  their date and source. Losing that label later is flagged as an open risk in RFC-0025.
- Don't do a single giant "translate everything to English" commit — RFC-0025 scopes this
  deliberately (Alternatives section) to avoid an unreviewable diff.
- Don't containerize the GPU path (Docker/CUDA) — considered and deferred in RFC-0025 Alternatives;
  Phase 3's cloud-provider path solves the portability problem more cheaply.

## Decisions made (see RFC-0025 for full reasoning)

- License: MIT. Test stack: `pytest` + `bun test` (native to each half already). Lint: Biome + Ruff.
  CI: `ubuntu-latest` only, GPU path explicitly out of scope. This RFC and all portfolio-facing docs
  it produces: written in English going forward — existing Italian inline comments are not being
  retroactively judged, just no longer the default for anything meant to be read from outside.

## Real technical debt

- 17 of the 23 RFCs cited in code (all but the 6 chosen for Phase 2 backfill) still don't exist as
  documents — tracked as an explicit follow-up in RFC-0025, not silently dropped.
- No lint/format tooling committed yet despite `strict` TypeScript already being correctly
  configured on both `client/` and `server/`.

## Next priorities

1. Get sign-off (or amendments) on RFC-0025, then execute Phase 0 — it alone resolves most of the
   audit's P0 (blocking) findings in about a day.
2. Phase 1 immediately after — verifiability is what turns the RFC trail from a claim into
   something a reviewer can check.

## Open risks

- Phase 3's cloud-provider path is unbenchmarked against the local Qwen3-8B path for output
  quality — the compiler prompts were tuned specifically against that model (RFC-0011/0013
  amendments). Don't present Phase 3 as quality-equivalent until it's actually compared.
- If only partial time is available, RFC-0025 explicitly names Phase 0 + Phase 1 as the minimum
  viable slice — everything else can slip without leaving the repo in a half-broken state.
