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

- 2026-07-22T03:50:09+02:00 — Added bounded end-to-end request traces and completed runtime English output cleanup.
- 2026-07-22T03:27:34+02:00 — Published 296 sanitized mock/local reference records with measured results and provenance.
- 2026-07-22T03:17:25+02:00 — Excluded generated Python bytecode from evaluation and release commits.
- 2026-07-22T03:15:15+02:00 — Implemented the 64-case deterministic evaluation, evidence pipeline and real local comparison.
- 2026-07-22T02:55:00+02:00 — Accepted RFC-0028 for versioned deterministic evaluation and evidence governance.
- 2026-07-22T02:45:57+02:00 — Completed Phase 2 authenticated protocol, bounded resources, cancellation, confinement and E2E hardening.
- 2026-07-22T02:15:00+02:00 — Accepted RFC-0027 for authenticated protocol v1, bounded resources and canonical confinement.
- 2026-07-22T02:05:52+02:00 — Completed Phase 1 portable providers, setup/preflight, offline demo and real local smoke.
- 2026-07-22T04:48:00+02:00 — Accepted RFC-0026 for provider profiles, typed errors, validated configuration and preflight.

## Where things stand

<!-- 5–10 lines, no more. What the project is doing right now, what is in flight, what is
fragile, what the next action is. Rewritten (not appended) from session.md + handoff.md
at the end of every patch. If it grows past 10 lines it has stopped being a summary. -->

- Root `RFC.md` is accepted; Phases 0–3 are complete and Phase 4 is in progress.
- One pinned Bun workspace now owns frozen install, format, lint, typecheck, tests, audits, demo and benchmark commands.
- Current gate is green: 47 Bun unit, 79 pytest and 7 integration tests; formatter, lint, typecheck and audits pass.
- Owner links target `PatrickDev-it`; security, support, release, environment and artifact provenance policies exist; dependency trees are ignored.
- Private remote and metadata exist; Phase 3 hosted CI run 29883201459 is green.
- Mock/local/openai-compatible profiles, conformance, setup/preflight, offline demo and real local smoke are implemented.
- Protocol v1, remote HMAC auth, bounded cancellation/reconnect, canonical paths and supervisor injection are implemented.
- `cowork-eval/v1` has 64 balanced cases and 296/296 successful sanitized mock/local reference records.
- Bounded end-to-end request tracing is opt-in, sanitized and loopback-only; public runtime output is English.
- Recruiter documentation, release automation, hosted PR/CI, v1.0.0 and final public launch remain.
- Preserve the historical field-loop fallback and never commit local runtime artifacts or credentials.
