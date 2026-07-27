# Handoff

Living project context during the project-context positioning patch on 2026-07-27.

## Current state

Repository is `PatrickDev-it/ai-prompt-optimizer`; the former URL permanently redirects. Branch
`codex/project-context-positioning` contains a README-only product-positioning patch plus Sinapsi records.

The README now makes the codebase-context advantage visible before the first example: local project scan,
explicit file selection, bounded directory tree, selected contents as authoritative context, optional web
grounding and timestamped prompt delivery.

It separates the user-facing tools accurately:

- `dev-prompt-enhancer`: project context, optional web search and provider reasoning.
- `prompt-enhancer`: standalone request, optional reasoning and opt-in Deep Research report.

GitHub description and topics now include project-aware, codebase-context and deep-research positioning.

## Verification

- Format, lint and both workspace typechecks: passed.
- 53 Bun unit, 79 pytest and 9 integration tests: passed.
- Documentation links: 41 files valid.
- Repository security/heavyweight-artifact scan and `git diff --check`: passed.

## Capability boundaries

- Project files are scanned locally and included only after explicit operator selection.
- Filtered directory tree is always included; dependency/build/cache/VCS and secret paths are denied.
- Context is bounded and may be truncated or semantically compressed.
- Deep Research is opt-in, networked and belongs to the standalone tool.
- No native IDE extension or silent whole-repository upload is claimed.

## Invariants

- Preserve `run_enhancement_field_loop` and v1 compatibility identifiers.
- Never commit models, runtime binaries, environments, credentials or user I/O.
- Keep project-context, search and Deep Research claims aligned with their actual tool boundaries.
- Finish each future patch with session, handoff, then summary updates.

## Next action

Commit and push `codex/project-context-positioning`, open a PR and merge only after CI and both CodeQL
languages pass. Verify README placement and repository metadata on public `main`.
