# Handoff

Living project context after root RFC Phase 3 completion on 2026-07-22.

## Current state

Root `RFC.md` is accepted. Phases 0–3 close P-01–P-15 locally, plus applicable P-16/P-19 work.
The private repository is `PatrickDev-it/cowork-prompt-enhancer`; Phase 2 hosted CI run 29881246507 is
green. Keep it private until every Phase 4 launch gate passes.

RFC-0026 owns the three provider profiles. RFC-0027 owns protocol-v1, remote HMAC authentication,
bounded scheduling/cancellation/reconnect, canonical paths and supervisor state. RFC-0028 owns the
`cowork-eval/v1` dataset, deterministic evidence formats and blinded review protocol.

## Verified Phase 3 implementation gate

- Formatter, Biome/Ruff, client/server typecheck, 46 Bun unit and 7 integration tests pass.
- Pytest rises from 62 to 78 full-suite tests. Provider conformance remains 25/25.
- Full mock evaluation produces 264 records across all 64 balanced cases and five applicable strategies.
- Real local evaluation produces 32 records across eight categories and four core strategies on an RTX
  3070 Ti; no owned llama-server process remains.
- Final local compiler: recall 0.917, precision 1.000, structure 0.792, executability 0.975, p50 8674 ms.
- Final local raw: recall 1.000, precision 1.000, structure 0.333, executability 0.725. This is an eight-case
  lexical-metric reference, not a full-corpus or human result.

## Important implementation facts

- `evaluation/datasets/v1/cases.jsonl` has 64 public non-sensitive cases, eight per category.
- `evaluation/benchmark.py` writes records, summary, environment and report files; live search is off.
- Provider observations expose calls, tokens, queue/generation timing and basename-only model identity.
- Python bytecode and benchmark working outputs are repository-wide ignored and must remain unstaged.
- Compiler success, fallback-delivered success and parse recovery are never conflated.
- `evaluation/human_review.py` randomizes opaque IDs and rejects invalid/incomplete imports; no human
  results exist or are claimed.
- Curated mock/local references contain 296/296 successful sanitized records and identify implementation
  commit `1cbbf26b63ea81fedc5a6922453ea00ea75090c8`.

## Remaining root RFC work

- Commit/push Phase 3 reference evidence and require hosted CI green.
- Phase 4 / P-17–P-20: recruiter README, public English cleanup, demo recording, threat/docs sync,
  changelog/SBOM/checksums, CodeQL/secret/dependency automation, release validation and clean-clone gate.
- Open the mapped feature PR, repair CI, merge without rewriting history, tag/release v1.0.0, then make
  the personal repository public as the final launch action.

## Invariants

- Do not alter `run_enhancement_field_loop` without an explicit equivalence-tested migration.
- Never commit models, binaries, CUDA libraries, virtual environments, `.env`, credentials or user I/O.
- Keep public output in professional English and reconstructed RFC metadata truthful.
- Do not touch Ignoryx, Privacy, organizations or unrelated repositories.
- Finish each patch with session, handoff, then summary updates.

## Next action

Commit and push the Phase 3 reference evidence, confirm hosted CI, then begin Phase 4.
