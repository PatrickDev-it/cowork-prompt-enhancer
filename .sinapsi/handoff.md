# Handoff

Living project context after root RFC Phase 1 implementation on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0 and 1 close P-01–P-03 locally and the applicable portions of
P-16/P-19. The private repository is `PatrickDev-it/cowork-prompt-enhancer`; baseline hosted CI run
29877887313 is green. Keep it private until every Phase 4 launch gate passes.

The root workspace owns pinned/frozen install, format, lint, typecheck, tests, audits, preflight, mock
demo, local smoke and benchmark commands. Public ownership, security, support, release, environment and
third-party provenance documentation exists.

RFC-0026 governs three explicit profiles: deterministic offline `mock` (default), supervised `local`,
and credentialed vendor-neutral `openai-compatible`. Provider failures are typed, secrets are redacted,
configuration fails before workers start, and legacy profile aliases have one-release compatibility.

RFC-0027 now governs Phase 2: loopback-default binding, HMAC challenge authentication for remote use,
protocol-v1 envelopes, stable error codes, bounded scheduling/cancellation/reconnect, canonical path
confinement and an injectable llama supervisor. Legacy unversioned frames are intentionally rejected.

## Verified Phase 1 gate

- Formatter, Biome/Ruff lint and client/server typecheck pass.
- 20 Bun unit, 59 pytest and 3 integration tests pass.
- Mock preflight, success/failure demo paths and full Python compiler E2E pass offline.
- Real local preflight confirms RTX 3070 Ti, llama executable/model paths and SHA-256 values.
- Real local-provider smoke generated successfully; zero orphan llama-server processes remain.
- Setup script parsers and pinned upstream archive checksum/layout were verified.
- Bun audit and pip-audit report no known vulnerabilities; `git diff --check` passes.

## Remaining root RFC work

- Phase 2 / P-04–P-07, P-11–P-13, P-15: authenticated versioned protocol, bounded scheduler,
  cancellation/reconnect, path confinement, supervisor failure injection and full integration.
- Phase 3 / P-08–P-10, P-14, P-15: 60-case dataset, deterministic scoring, baseline comparison,
  provenance, timings, human-review exchange and report.
- Phase 4 / P-17–P-20: recruiter README/demo, synchronized architecture/threat model, release assets,
  green PR/CI, stable release and final public transition.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or I/O.
- Keep reconstructed RFC labels/dates truthful and new public output in professional English.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Phase 1 commit `6ef7604` is pushed and hosted CI run 29879307065 is green. Implement RFC-0027 with
contract/security/failure-injection/full mock E2E coverage, then push and require hosted CI green.
