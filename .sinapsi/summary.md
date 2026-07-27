# Summary

<!-- Sinapsi keeps the directory tree below current on its own — on every build, and live
     from the watcher whenever a file or folder is created, moved or deleted. There is no
     command to run and nothing to ask an agent to do. Do not edit between its markers;
     your edits are replaced. Everything else in this file is yours. -->

<!-- sinapsi:start v0.2.6 — kept current automatically by Sinapsi — refreshed on every build and by the watcher whenever files or folders are created, moved or deleted. No command to run; edits between these markers are replaced -->
```
client/
  (io)/
  events/
  lib/
  .env
  .env.example
  .gitignore
  bun.lock
  config.ts
  index.ts
  package.json
  tsconfig.json
docs/
  DEV.md
  architecture.md
server/
  bin/
  events/
  lib/
  models/
  modules/
  tools/
  .gitignore
  bun.lock
  config.ts
  index.ts
  package.json
  tsconfig.json
.gitignore
.mcp.json
AGENTS.md
LICENSE
README.md
RFC.md
biome.json
```
<!-- sinapsi:end -->

**Read this first, and usually only this.** It is the cardinal read at the start of every
patch: the project's shape (above), the last sessions at a glance, and a short recap. Open
`session.md` or `handoff.md` only when this file leaves your actual question unanswered.

## Recent sessions

<!-- The last 10 patches, newest first: `- <timestamp> — <one line>`. Appended by the
agent at the end of every patch, at the same time it appends session.md. Drop the
11th; the full history is in session.md and, once archived, in archive/. -->

- 2026-07-27T16:35:00+02:00 — Renamed the product and repository around the remote-first home-workstation workflow.
- 2026-07-27T15:20:00+02:00 — Repositioned Cowork for search-led prompt-optimizer discovery and developer adoption.
- 2026-07-22T04:59:53+02:00 — Completed final verification, v1.0.0, public security controls and CodeQL activation.
- 2026-07-22T04:40:02+02:00 — Removed temporary pip resolution from the complete hash-locked dependency audit.
- 2026-07-22T04:30:58+02:00 — Corrected private CodeQL retention to a safe workspace-relative artifact path.
- 2026-07-22T04:26:10+02:00 — Made CodeQL evidence portable across private and public repository visibility.
- 2026-07-22T04:20:04+02:00 — Passed the clean-clone launch gate and repaired least-privilege CodeQL access.
- 2026-07-22T04:15:01+02:00 — Fixed CRLF formatter drift exposed by the first clean Windows clone.
- 2026-07-22T04:12:41+02:00 — Replaced the public narrative with measured recruiter-first documentation.
- 2026-07-22T04:08:46+02:00 — Added expanded CI, CodeQL, Dependabot and tag-based release validation.

## Where things stand

<!-- 5–10 lines, no more. What the project is doing right now, what is in flight, what is
fragile, what the next action is. Rewritten (not appended) from session.md + handoff.md
at the end of every patch. If it grows past 10 lines it has stopped being a summary. -->

- Repository is `PatrickDev-it/ai-prompt-optimizer`; the former GitHub URL permanently redirects.
- Public product name is Prompt Enhancer; Cowork describes only the original development mode.
- Primary workflow: always-on home GPU workstation serving a MacBook/laptop IDE terminal client.
- No native IDE extension or direct-public-port recommendation is claimed.
- `docs/remote-ide-workstation.md` documents private networking, auth and two-machine operation.
- Package, workflow, release, schema, CLI and site links use the new identity.
- `COWORK_*` and `cowork-eval/v1` remain v1 compatibility/evidence identifiers.
- Format/lint/typechecks, 53 Bun, 79 pytest, 9 integration, audits, docs and scans pass.
- Site/JSON-LD/social/IndexNow validation passes; clean renamed release build remains before publication.
- Preserve evidence limits, remote security boundary and field-loop fallback.
