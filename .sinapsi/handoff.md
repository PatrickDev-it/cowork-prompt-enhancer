# Handoff

Living project context after root RFC Phase 0 implementation on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phase 0 closes P-01 locally and the repository portions of P-16–P-19:
the workspace has one pinned, frozen command surface; ownership links target `PatrickDev-it`; public
security/support/release/environment/provenance policies exist; CI uses the same root gate.

The originally dirty worktree was classified and preserved. Sinapsi 0.2.6 instruction/summary changes
were generated pre-existing work; `RFC.md` plus its earlier memory update were required RFC work; no
unrelated modification existed. Python formatting was required to make the formatter check truthful.

## Verified Phase 0 gate

- Bun 1.3.12, Node 22.13.0 and Python 3.12.4 pinned.
- Root frozen Bun install and hash-verified Python install pass.
- Biome format/lint and Ruff format/lint pass.
- Client/server typecheck pass.
- 15 Bun server tests, 32 pytest tests and 1 root integration test pass.
- Bun and Python dependency audits report no known vulnerabilities.
- Root and package `node_modules/` trees are ignored; no candidate source file exceeds 10 MiB.
- Local RTX 3070 Ti and expected artifacts exist; llama endpoint was not running during baseline.
- No runtime protocol/provider behavior changed.

## Phase 0 external gate

Create `PatrickDev-it/cowork-prompt-enhancer` privately, push the phase branch, apply description/homepage/
topics, and verify hosted CI. Do not make the repository public before all Phase 4 gates pass.

## Remaining root RFC work

- Phase 1 / P-02, P-03, P-16, P-19: mock/local/openai-compatible providers, validated profiles,
  setup/preflight, conformance, mock E2E and local smoke.
- Phase 2 / P-04–P-07, P-11–P-13, P-15: authenticated versioned protocol, bounded scheduler,
  cancellation/reconnect, path confinement, supervisor failure injection and full integration.
- Phase 3 / P-08–P-10, P-14, P-15: 60-case dataset, deterministic scoring, baseline comparison,
  provenance, timings, human-review exchange and report.
- Phase 4 / P-17–P-20: recruiter README, demo, synchronized architecture/threat model, release assets,
  green PR/CI, stable release and final public transition.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or I/O.
- Keep reconstructed RFC labels and dates truthful.
- Keep new public interfaces, logs and comments in professional English.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Finish the external Phase 0 gate, then implement provider/config RFC decisions and Phase 1 tests before
touching protocol security. Root `demo:mock` and `benchmark` command names are reserved now and become
executable at their owning phase gates.
