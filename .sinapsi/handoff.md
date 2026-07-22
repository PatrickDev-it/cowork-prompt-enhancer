# Handoff

Living project context during root RFC launch on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–4 implementation, delivery automation and recruiter documentation are
committed on `feat/rfc-completion`. The private repository is `PatrickDev-it/cowork-prompt-enhancer` and
must remain private through every launch gate. PR #1 is open. A visibility-aware CodeQL SARIF retention
repair is the only uncommitted source change.

RFC-0026 owns provider profiles, RFC-0027 protocol/security/resource hardening and RFC-0028 evaluation.
The launch patch adds no provider, protocol, authentication or artifact-format decision.

## Verified gate

- A fresh Windows clone completed the exact mock quickstart in 8.092 seconds.
- Its full release gate passed in 93.428 seconds with clean diff/status.
- 53 Bun unit, 79 pytest and 8 integration tests pass.
- Formatter, Biome/Ruff, client/server typecheck, 39-file docs and repository scan pass.
- Bun and Python audits report zero findings.
- The demo proves compiler success, malformed-output field-loop fallback, artifact and 264 records.
- The release builder emits 11 assets with 108 dependencies, CycloneDX 1.6 and full SHA-256 coverage.
- Provider, protocol/security/path, supervisor failure and E2E suites remain green.

## Evaluation evidence

- `cowork-eval/v1` contains 64 balanced, public, non-sensitive cases.
- Curated mock/local references contain 296/296 successful sanitized records tied to commit `1cbbf26`.
- Local compiler recall/precision/structure/executability: 0.917/1.000/0.792/0.975.
- Local raw reference: 1.000/1.000/0.333/0.725; evidence is an eight-case lexical subset, not human proof.

## Remaining launch work

- Commit/push private SARIF retention and require CI plus both CodeQL language matrices green.
- Open the P-01–P-20 mapped PR, repair any failure and merge without rewriting history.
- Repeat mandatory final verification on merged `main`, including supported local inference smoke.
- Tag v1.0.0, require tag validation green and publish the checksummed release assets.
- Apply final personal-repository security/branch settings and make the repository public only last.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Commit/push the CodeQL visibility repair, then require refreshed hosted CI and CodeQL green on PR #1.
