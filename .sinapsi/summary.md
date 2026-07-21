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

- 2026-07-22T04:10:00+02:00 — Completed root RFC Phase 0 locally: frozen workspace, pinned tools, policy/provenance docs, owner links and green root validation.
- 2026-07-22T00:53:47+02:00 — Added and structurally validated Proposed root portfolio RFC: flagship positioning, 20 problems, launch/security/portability/evaluation plan and agent contract.

## Where things stand

<!-- 5–10 lines, no more. What the project is doing right now, what is in flight, what is
fragile, what the next action is. Rewritten (not appended) from session.md + handoff.md
at the end of every patch. If it grows past 10 lines it has stopped being a summary. -->

- Root `RFC.md` is accepted; Phase 0 implementation is locally complete.
- One pinned Bun workspace now owns frozen install, format, lint, typecheck, tests, audits, demo and benchmark commands.
- Phase 0 gate is green: 15 Bun server, 32 pytest and 1 integration test; formatter, lint, typecheck and audits pass.
- Owner links target `PatrickDev-it`; security, support, release, environment and artifact provenance policies exist; dependency trees are ignored.
- Remote creation/push/hosted CI remain the Phase 0 external gate; visibility must stay private until Phase 4.
- Phase 1 provider profiles, setup/preflight, conformance and mock E2E are next.
- Protocol hardening, evaluation corpus/report and final recruiter release remain open.
- Preserve the historical field-loop fallback and never commit local runtime artifacts or credentials.
