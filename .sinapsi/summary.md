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

- 2026-07-22T04:26:10+02:00 — Made CodeQL evidence portable across private and public repository visibility.
- 2026-07-22T04:20:04+02:00 — Passed the clean-clone launch gate and repaired least-privilege CodeQL access.
- 2026-07-22T04:15:01+02:00 — Fixed CRLF formatter drift exposed by the first clean Windows clone.
- 2026-07-22T04:12:41+02:00 — Replaced the public narrative with measured recruiter-first documentation.
- 2026-07-22T04:08:46+02:00 — Added expanded CI, CodeQL, Dependabot and tag-based release validation.
- 2026-07-22T04:04:50+02:00 — Made credential-scan regression fixtures inert without weakening detection.
- 2026-07-22T04:01:42+02:00 — Added the reproducible demo, scans, SBOM and checksummed release bundle gate.
- 2026-07-22T03:50:09+02:00 — Added bounded end-to-end request traces and completed runtime English output cleanup.
- 2026-07-22T03:27:34+02:00 — Published 296 sanitized mock/local reference records with measured results and provenance.
- 2026-07-22T03:17:25+02:00 — Excluded generated Python bytecode from evaluation and release commits.

## Where things stand

<!-- 5–10 lines, no more. What the project is doing right now, what is in flight, what is
fragile, what the next action is. Rewritten (not appended) from session.md + handoff.md
at the end of every patch. If it grows past 10 lines it has stopped being a summary. -->

- Root `RFC.md` is accepted; Phases 0–4 implementation and recruiter delivery are complete on `feat/rfc-completion`.
- The pinned Bun workspace owns frozen install, format, lint, typecheck, test, audit, demo, benchmark and release commands.
- A fresh Windows clone completed quickstart in 8.092 seconds and the full release gate in 93.428 seconds.
- Current gate: 53 Bun unit, 79 pytest and 8 integration tests; format/lint/typecheck/docs/scans/audits pass.
- Mock/local/openai-compatible providers, protocol v1, remote HMAC auth, bounded resources and tracing are implemented.
- `cowork-eval/v1` has 64 balanced cases and 296/296 successful sanitized mock/local reference records.
- The 133-line README leads with measured evidence; demo, 11-asset SBOM/checksum release and provenance align.
- PR #1 is open and CI is green; pending CodeQL repair retains private SARIF and uploads natively once public.
- Remaining work is hosted PR/merge, merged-main verification, v1.0.0 release, security settings and final public launch.
- Preserve the field-loop fallback; never commit local artifacts/credentials or touch unrelated repositories.
