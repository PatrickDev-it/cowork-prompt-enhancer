# Handoff

Living project context during the search-led adoption patch on 2026-07-27.

## Current state

Stable `v1.0.0` remains unchanged. Branch `codex/seo-geo-growth` contains documentation-only positioning
work based on three supplied worldwide Google Trends exports. Relevant demand favors AI/OpenAI/GPT prompt
optimizer queries, with strong growth around Gemini and Claude Code; unrelated image/photo traffic is
deliberately excluded.

The README now leads with the developer outcome, the motto “Write it rough. Cowork compiles the rest,” a
rough-to-structured example, accurate target/provider distinctions, remote-workstation operation and FAQ.
`docs/ai-prompt-optimizer-guide.md` provides an indexable evidence-linked explainer. No runtime, protocol,
provider, evaluation or release contract changed.

GitHub API metadata has an outcome-led description, 20 relevant topics and Discussions enabled. The
canonical landing-page patch lives in the separate `PatrickDev-it.github.io` repository.

## Verification

- Documentation links: 39 files valid.
- Repository security/heavyweight-artifact scan: passed.
- `git diff --check`: passed.
- Format, lint and both workspace typechecks: passed.
- 53 Bun unit, 79 pytest and 9 integration tests: passed.
- Canonical static-site validator and IndexNow dry run pass in the site repository.

## Evaluation boundary

- Local compiler recall/precision/structure/executability remains 0.917/1.000/0.792/0.975.
- Local raw reference remains 1.000/1.000/0.333/0.725.
- Evidence is an eight-case lexical subset, not human proof or universal downstream superiority.
- ChatGPT, Gemini, Claude Code and Codex are portable-text targets, not claimed native integrations.

## Invariants

- Preserve `run_enhancement_field_loop` unless an equivalence-tested RFC migration supersedes it.
- Never commit models, runtime binaries, CUDA libraries, environments, credentials or user I/O.
- Keep provider claims exact: mock, local and operator-selected OpenAI-compatible inference.
- Keep public vendor-affiliation disclaimers and evidence limitations explicit.
- Finish each future patch with session, handoff, then summary updates.

## Next action

Commit and push `codex/seo-geo-growth`, open a PR and merge only after required CI/CodeQL. Then verify the
separately published GitHub Pages landing and crawler metadata.
