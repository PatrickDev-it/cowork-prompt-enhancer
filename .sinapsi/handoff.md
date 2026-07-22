# Handoff

Living project context at stable public launch on 2026-07-22.

## Current state

Root `RFC.md` is accepted and P-01–P-20 implementation is complete. Product work merged through PR #1;
the deterministic-audit correction merged through PR #11 as `8377db3`. Stable release `v1.0.0` is
published at `PatrickDev-it/cowork-prompt-enhancer`, and the repository is public with launch security
controls enabled. Branch `chore/public-codeql-dispatch` contains the final uncommitted workflow-only patch.

RFC-0026 owns provider profiles, RFC-0027 protocol/security/resource hardening and RFC-0028 evaluation.
The final patch adds manual CodeQL dispatch and changes no runtime contract or release artifact.

## Final verification

- Fresh clone frozen setup: 6.207 seconds; full release gate: 30.024 seconds.
- 53 Bun unit, 79 pytest and 9 integration tests passed.
- Provider 25/25, protocol/security 26/26, supervisor 5/5 and mock E2E 4/4 passed.
- Formatter, Biome/Ruff, client/server typecheck, 39-file docs and repository scan passed.
- Bun and Python audits report zero findings; mock benchmark produced 264 records.
- Supported local-provider smoke passed in 19.289 seconds.
- Clean clone `git diff --check` and status passed.
- Public CodeQL completed for Python and TypeScript.

## Evaluation evidence

- `cowork-eval/v1` contains 64 balanced, public, non-sensitive cases.
- Curated mock/local references contain 296/296 successful sanitized records.
- Local compiler recall/precision/structure/executability: 0.917/1.000/0.792/0.975.
- Local raw reference: 1.000/1.000/0.333/0.725; evidence is an eight-case lexical subset, not human proof.

## Release and repository

- `v1.0.0` targets `8377db3`; tag CI and release validation passed.
- Release has 11 assets; ten manifest hashes revalidated after download.
- Assets include source, changelog, benchmark evidence, 108-item inventory, CycloneDX 1.6 and provenance.
- Secret scanning/push protection, alerts, automated fixes and private reporting are enabled.
- `main` requires strict CI plus both CodeQL contexts; force pushes and deletion are blocked.
- Description, README homepage and nine focused topics target `PatrickDev-it`.

## Invariants

- Preserve `run_enhancement_field_loop` unless an equivalence-tested RFC migration supersedes it.
- Never commit models, runtime binaries, CUDA libraries, environments, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each future patch with session, handoff, then summary updates.

## Next action

Commit/push the workflow-only dispatch patch, merge after public CI/CodeQL, then manually dispatch and
verify the authoritative `main` CodeQL workflow. No product requirement remains open.
