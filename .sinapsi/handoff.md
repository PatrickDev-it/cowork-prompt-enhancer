# Handoff

Living project context during root RFC launch on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–4 implementation, automation and recruiter delivery merged through
PR #1 as `74e511e`. The private repository is `PatrickDev-it/cowork-prompt-enhancer` and must stay private
through the remaining launch gates. Branch `fix/reproducible-python-audit` contains one uncommitted
deterministic-audit patch discovered by mandatory merged-main verification.

RFC-0026 owns provider profiles, RFC-0027 protocol/security/resource hardening and RFC-0028 evaluation.
The audit patch changes no provider, protocol, authentication, storage or release format.

## Verified gate

- PR #1 merged after two CI and four CodeQL checks passed; private SARIF artifacts are retained.
- A merged-main fresh clone installed frozen/hash-locked dependencies in 6.643 seconds.
- Formatter, Biome/Ruff, both typechecks, 53 Bun unit, 79 pytest and 8 integration tests passed there.
- Deterministic Bun/Python audits now pass with zero findings and have a workspace regression.
- A prior clean Windows clone completed quickstart in 8.092 seconds and the release gate in 93.428 seconds.
- Docs cover 39 files; repository scanning, demo, 264-record benchmark and release validation are green.
- Release output is 11 assets, 108 dependencies, CycloneDX 1.6 and complete SHA-256 coverage.

## Evaluation evidence

- `cowork-eval/v1` contains 64 balanced, public, non-sensitive cases.
- Curated mock/local references contain 296/296 successful sanitized records tied to commit `1cbbf26`.
- Local compiler recall/precision/structure/executability: 0.917/1.000/0.792/0.975.
- Local raw reference: 1.000/1.000/0.333/0.725; evidence is an eight-case lexical subset, not human proof.

## Remaining launch work

- Commit/push the deterministic pip-audit patch, open a follow-up PR and require CI/CodeQL green.
- Merge without rewriting history and repeat the complete mandatory verification from fresh `main`.
- Run the supported local-provider smoke on the workstation artifacts.
- Tag v1.0.0, require tag validation green and publish the checksummed release assets.
- Make the repository public last, then enable native code scanning, secret scanning and required checks.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Commit/push `fix/reproducible-python-audit`, open the follow-up PR and require all hosted checks green.
