# Handoff

Living project context after root RFC Phase 2 implementation on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–2 close P-01–P-07 and P-11–P-13 locally, plus applicable
P-15/P-16/P-19 work. The private repository is `PatrickDev-it/cowork-prompt-enhancer`; Phase 1 hosted CI
run 29879307065 is green. Keep it private until every Phase 4 launch gate passes.

RFC-0026 owns deterministic `mock` (default), supervised `local`, and credentialed vendor-neutral
`openai-compatible` profiles. RFC-0027 owns loopback-default binding, HMAC challenge authentication,
protocol-v1 envelopes, stable errors, bounded scheduling/cancellation/reconnect, canonical filesystem
confinement and the injectable llama supervisor.

RFC-0028 now owns Phase 3 evidence: `cowork-eval/v1`, 64 balanced cases, deterministic primary metrics,
complete mock comparison, declared stratified local comparison, provenance, immutable raw/report formats
and blinded human-review exchange without invented ratings.

## Verified Phase 2 gate

- Formatter, Biome/Ruff lint and client/server typecheck pass.
- 46 Bun unit, 62 pytest and 7 integration tests pass.
- Named suites: provider 25, protocol/security/path 26, supervisor failure injection 5, E2E 4.
- E2E proves full mock artifact delivery, remote anonymous/replay rejection, provider cancellation, and
  server restart/client reconnect without duplicate execution.
- Real RTX 3070 Ti local-provider smoke passes; no llama-server or Python worker remains orphaned.
- Bun and pip audits report no vulnerabilities; secret-pattern scan and `git diff --check` pass.

## Important implementation facts

- Protocol source of truth is `protocol/index.ts`; legacy frames are intentionally invalid.
- Default bounds: 1 MiB frame, 512 KiB payload, 4 global active, 2/session, 32 queued, 600 s deadline.
- Remote bind requires explicit opt-in and a minimum 32-character secret; challenge/proof values are not
  logged. TLS termination remains an operator responsibility beyond a trusted network.
- Cancellation kills the shared Python worker to terminate its provider request; concurrent requests fail
  safely and are not replayed.
- Path confinement rejects absolute/traversal/mixed/reserved paths and symlink/junction ancestors.

## Remaining root RFC work

- Phase 3 / P-08–P-10, P-14, P-15: 60-case versioned dataset, deterministic scoring, strategy/grounding
  comparison, provenance/timings, human-review exchange, raw results and evidence-linked report.
- Phase 4 / P-17–P-20: recruiter README/demo, public English cleanup, release/SBOM/checksums, green PR/CI,
  stable release and final public transition.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or I/O.
- Keep reconstructed RFC labels/dates truthful and public output in professional English.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Phase 2 commit `e9f9062` is pushed and hosted CI run 29881246507 is green. Implement RFC-0028 corpus,
schema, runner, tests, mock reference and real local stratified comparison before making claims.
