# Handoff

Living project context — not a changelog. Rewritten in full (not appended) on every patch, as if a senior engineer were handing the work off to the next one.

## Where we are

RFC-0025 is **executed**: Phase 0 (Repository Foundation), Phase 1 (Verifiability), and Phase 2
(Legibility) are all done, committed, and verified green. This is now a real git repository —
`git init` with 18 logically staged commits reading as an engineered import, then a hardening pass,
then a legibility pass — with a README, LICENSE, CI, tests, lint, and six backfilled RFCs. Phase 3
(Portability — a GPU-free cloud-provider path) is **not started**; it remains a stretch goal.

## What is complete

- **Phase 0:** `git init -b main`, MIT `LICENSE`, root `README.md` (pitch, architecture diagram,
  quickstart, decision-log table, CI badge), `docs/DEV.md`. Secret sweep done (`client/.env` had no
  live keys — a server IP/port only); `client/.env.example` replaces it, `client/.gitignore` now
  excludes `.env` (it previously didn't — fixed before the first commit).
- **Phase 1:** 32 `pytest` cases (`server/modules/prompt_enhancer/tests/test_workflow.py`) covering
  every pure parsing/coercion/rendering function; 15 `bun test` cases across three new files
  (`tools/index.test.ts`, `tools/fs.test.ts`, `tools/runtime.test.ts`) — the last includes a
  regression test for the historical `sub_prompts`-nested `compress:true` bug. `.github/workflows/ci.yml`
  runs typecheck + lint + test for both packages on `ubuntu-latest`. `biome.json` (client+server) and
  `server/modules/pyproject.toml` (Ruff) are wired in and clean (`biome ci .` and `ruff check` both
  exit 0). Scoped English-translation pass done on the six files RFC-0025 named
  (`workflow.py`, `config.ts`, `supervisor.ts`, `providers/base.py`, `fs.ts`, `runtime.ts`) —
  module docstrings and exported-function JSDoc, not every historical inline comment.
- **Phase 2:** `docs/architecture.md` (component diagram, request sequence, module-ownership table,
  explicit Threat Model section). Six RFCs backfilled into `.sinapsi/rfc/`: 0002 (WS protocol), 0008
  (fileop capability negotiation), 0014 (supervised llama-server), 0015 (context-compression HEAD),
  0018 (Intent-to-Specification Compiler), 0024 (concurrency tuning) — each labeled "Accepted
  (reconstructed)", dated, sourced. `workflow.py` (915 lines) split into `prompts.py` / `coercion.py`
  / `strategies.py` / a thinned `workflow.py`, done after Phase 1's tests existed and verified by
  them (all 32 still pass, only import lines changed).

Two small, intentional deviations from RFC-0025's literal text, both logged in
`.sinapsi/decisions.md` rather than silently applied:
1. `build_compiled_prompt` lives in `coercion.py`, not `workflow.py` — it's called from both
   `strategies.run_enhancement_field_loop` and `workflow.run_enhancement`, and workflow.py already
   imports from strategies.py, so putting it in either caller would cycle.
2. `types.ts` and a handful of runtime log-string literals were left in Italian — the translation
   pass covered doc comments only, per RFC-0025's explicit scoping (Decision § 6, Alternatives).

## What remains

- **Phase 3** (stretch, not started): `providers/openai_compatible.py` implementing the existing
  `LLMProvider` Protocol; `LLMEngine.__post_init__` provider selection via
  `COWORK_PROMPT_ENHANCER_PROVIDER`; `setup.ps1`/`setup.sh` for the full local/GPU path; a
  README quickstart with both paths side by side. Nothing here is blocking — RFC-0025's Decision
  section explicitly treats Phase 0+1 as the minimum viable slice, Phase 2 as required before
  pointing an interviewer at a technical deep-dive, Phase 3 as valuable but optional.
- **17 cited-but-unwritten RFCs** (0003-0007, 0009-0013, 0016-0017, 0019-0023) — tracked as an open
  follow-up in RFC-0025 Consequences and in the README/architecture.md, not hidden.
- **No recorded demo** (RFC-0025 Phase 2.4, a 60-90s asciinema/GIF for the README) — not something
  this session could produce (no screen-recording capability); still open.
- The README's CI badge and RFC links point at a placeholder GitHub path
  (`emanuelecella/cowork-prompt-enhancer`) since there is no remote yet — update both once the repo
  is actually pushed, or the badge will 404.
- The architecture.md threat model recommends defaulting the WS server bind to `127.0.0.1` with an
  explicit opt-in for wider exposure — flagged, not implemented, since the observed real deployment
  (the original `client/.env`, never committed) pointed at a non-loopback address, and silently
  changing the bind default could break that without warning.

## What is fragile

- `run_enhancement_field_loop` (now in `strategies.py`) must still not be altered (RFC-0005 § crit.
  4) — it was copied verbatim during the split and stays the untouched safety net every other
  strategy falls back to.
- The vendored GPU stack (`server/bin/`, `server/models/*.gguf`, `server/modules/.venv/`) is
  correctly `.gitignore`d; nothing in this session's work changed that or needs to.

## What to avoid

- Don't backdate the six backfilled RFCs or drop their "reconstructed" labeling — RFC-0025 Decision
  § 5 treats that as an integrity requirement, not decoration.
- Don't silently translate more Italian comments beyond the six named files — RFC-0025 scoped this
  deliberately; do it opportunistically when a file is next touched for another reason.
- Don't change the WS server's default bind without the user's explicit go-ahead (see threat-model
  note above) — it could break an existing remote-access deployment.

## Decisions made this patch (see RFC-0025 for full reasoning; see `.sinapsi/decisions.md` for the two deviations)

- License: MIT. Test stack: `pytest` + `bun test`. Lint: Biome + Ruff. CI: `ubuntu-latest` only.
- `build_compiled_prompt` placed in `coercion.py`, not `workflow.py`, to avoid a circular import
  (see Decisions above).

## Real technical debt

- 17 of 23 cited RFCs still don't exist as documents (tracked, not hidden).
- No recorded demo yet.
- Phase 3 (cloud-provider path) unstarted — the project still requires an NVIDIA GPU + ~7 GB of
  vendored binaries to actually run.

## Next priorities

1. Push to a real GitHub remote, then fix the README CI badge / RFC-link placeholders to match.
2. If pursuing Phase 3: start with `providers/openai_compatible.py` against the existing
   `LLMProvider` Protocol — the lowest-risk piece, since the contract already exists.
3. Otherwise: this repository is now in the state RFC-0025 designated safe to link from a resume or
   application (Phase 0+1+2 all done) — no further work is required to reach that bar.

## Open risks

- Phase 3's cloud-provider path (if pursued) is unbenchmarked against the local Qwen3-8B path for
  output quality — RFC-0025's own open risk, still unresolved, still applicable.
- The threat-model gap (no auth, no enforced loopback bind) is now documented but not fixed — an
  operator relying on this being closed by default would be wrong to assume so.
