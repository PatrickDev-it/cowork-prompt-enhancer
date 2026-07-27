# Handoff

## Current state

Repository identity is `PatrickDev-it/ai-prompt-optimizer`; product-facing copy now consistently uses
**AI Prompt Optimizer**. The active branch is `codex/global-ai-prompt-optimizer-brand`.

README, product guide, remote-workstation guide, architecture entry point, server startup message and
CLI description use the new public name. The product page has moved in the companion portfolio repository
to `/projects/ai-prompt-optimizer/`; README links use that canonical path.

## Compatibility boundary

- `dev-prompt-enhancer` and `prompt-enhancer` remain stable tool names.
- `COWORK_*` configuration and `cowork-eval/v1` remain v1 compatibility/evidence identifiers.
- No runtime provider, protocol, filesystem or output contract changed.

## Verification required

- Run `bun run check`, `bun run docs:check`, `bun run security:scan` and `git diff --check`.
- Commit and publish the branch; require CI plus TypeScript and Python CodeQL before merge.
- Verify rendered README title/link and GitHub repository description after merge.

## Invariants

- Keep claims aligned to the two-tool capability split and explicit file-selection boundary.
- Preserve remote exposure safeguards, deterministic fallback and historical field-loop behavior.
- Never commit models, runtime binaries, environments, credentials or user I/O.
- Finish future patches with session, handoff, then summary updates.
