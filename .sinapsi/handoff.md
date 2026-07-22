# Handoff

Living project context during root RFC Phase 4 on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–3 are complete; the P-15 production observability/P-18 runtime
English patch is complete and awaiting commit. The private repository is
`PatrickDev-it/cowork-prompt-enhancer`; hosted Phase 3 CI run 29883201459 is green. Keep the repository
private until every Phase 4 launch gate passes.

RFC-0026 owns provider profiles, RFC-0027 owns protocol/security/resource hardening and RFC-0028 owns
versioned evaluation evidence. No new protocol or configuration decision was introduced by observability.

## Verified gate

- Formatter, Biome/Ruff and client/server typecheck pass.
- 47 Bun unit, 79 pytest and 7 integration tests pass.
- Provider conformance, protocol/security/path, supervisor failure and full E2E suites remain green.
- Bun and pip audits report zero known vulnerabilities; `git diff --check` passes.
- The mock E2E verifies one trace across queue, compression, generation, fallback state and artifact.
- Request metrics are disabled by default, bounded to 100 entries and rejected off loopback.

## Evaluation evidence

- `cowork-eval/v1` contains 64 balanced, public, non-sensitive cases.
- Curated mock/local references contain 296/296 successful sanitized records tied to commit `1cbbf26`.
- Local compiler recall/precision/structure/executability: 0.917/1.000/0.792/0.975.
- Local raw reference: 1.000/1.000/0.333/0.725; evidence is an eight-case lexical subset, not human proof.

## Remaining root RFC work

- Commit/push the P-15/P-18 observability patch and require hosted CI green.
- Build recruiter-first README, demo transcript, docs/link validation, secret scan and release builder.
- Add current CodeQL, dependency updates and release workflows; synchronize changelog/support/provenance.
- Validate a clean clone, open the mapped PR, repair CI, merge without history rewriting, tag/release
  v1.0.0, then make the personal repository public as the final launch action.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Commit and push the observability patch, confirm hosted CI, then implement Phase 4 delivery automation.
