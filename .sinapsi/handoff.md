# Handoff

Living project context during the remote-first product rename on 2026-07-27.

## Current state

GitHub repository is now `PatrickDev-it/ai-prompt-optimizer`; the former
`PatrickDev-it/cowork-prompt-enhancer` URL permanently redirects. Branch `codex/remote-first-rename`
contains the identity and remote-first workflow patch.

The public product name is Prompt Enhancer. Cowork appears in marketing only as the original development
mode: an always-on home workstation runs GPU inference while a MacBook or lighter laptop uses the client
from an IDE integrated terminal. There is no claimed native IDE extension.

Package, workflow, release artifact, schema, CLI, documentation and repository-link identities use
`ai-prompt-optimizer` or Prompt Enhancer. `COWORK_*`, `cowork-eval/v1` and deterministic model IDs remain
v1 compatibility contracts.

## Verification

- Format, lint and both workspace typechecks: passed.
- 53 Bun unit, 79 pytest and 9 integration tests: passed.
- Bun and Python dependency audits: zero findings.
- Documentation links: 40 files valid.
- Repository security/heavyweight-artifact scan and deterministic demo: passed.
- Canonical site validator and IndexNow dry run: passed.
- Renamed release build/validation remains after the worktree is committed and clean.

## Evaluation boundary

- Local compiler recall/precision/structure/executability remains 0.917/1.000/0.792/0.975.
- Evidence remains an eight-case lexical subset, not human proof or universal downstream superiority.
- ChatGPT, Gemini, Claude Code and Codex remain portable-text targets, not native integrations.
- Remote access requires explicit opt-in, HMAC authentication, private networking and operator-managed TLS.

## Invariants

- Preserve `run_enhancement_field_loop` unless an equivalence-tested RFC migration supersedes it.
- Preserve v1 environment/evaluation identifiers unless a versioned migration replaces them.
- Never commit models, runtime binaries, environments, credentials or user I/O.
- Do not claim direct public port exposure or a native IDE extension.
- Finish each future patch with session, handoff, then summary updates.

## Next action

Commit `codex/remote-first-rename`, build and validate the clean renamed release bundle, push and open a PR.
Publish the portfolio branch separately, then verify hosted checks, redirect and production metadata.
