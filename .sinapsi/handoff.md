# Handoff

Living project context during root RFC Phase 4 on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–3, observability, delivery, automation and recruiter docs are committed.
A clean-clone LF portability fix is awaiting commit. The private repository is `PatrickDev-it/cowork-prompt-enhancer`;
hosted CI run 29884245471 for `d13fcf5` is green. Keep it private through all launch gates.

RFC-0026 owns provider profiles, RFC-0027 protocol/security/resource hardening and RFC-0028 evaluation.
The delivery tooling adds no public provider, protocol, authentication or artifact-format decision.

## Verified gate

- Formatter, Biome/Ruff and client/server typecheck pass.
- 53 Bun unit, 79 pytest and 7 integration tests pass.
- Documentation validation covers 39 tracked Markdown files; secret/heavyweight scan is green.
- The sanitized demo proves compiler success, malformed-output field-loop fallback, artifact and 264 records.
- The release builder emits 11 assets with 108 dependencies, CycloneDX 1.6 and full SHA-256 coverage.
- Provider, protocol/security/path, supervisor failure and E2E suites remain green.

## Evaluation evidence

- `cowork-eval/v1` contains 64 balanced, public, non-sensitive cases.
- Curated mock/local references contain 296/296 successful sanitized records tied to commit `1cbbf26`.
- Local compiler recall/precision/structure/executability: 0.917/1.000/0.792/0.975.
- Local raw reference: 1.000/1.000/0.333/0.725; evidence is an eight-case lexical subset, not human proof.

## Remaining root RFC work

- Commit/push the delivery tooling and require hosted CI green.
- Push the expanded CI, CodeQL, Dependabot and tag-release automation; repair every hosted failure.
- Push recruiter documentation and require refreshed CI plus both CodeQL languages green.
- Push the LF fix, create a new external clone, repeat the quickstart and complete release gate.
- Validate a clean clone, open the mapped PR, repair CI, merge without history rewriting, tag/release
  v1.0.0, then make the personal repository public as the final launch action.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Commit/push LF normalization, repeat a new clean clone, then execute the PR/release/publication sequence.
