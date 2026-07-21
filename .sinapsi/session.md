# Session log

Operational changelog, append-only, chronological order — never delete previous entries.

Every entry must include: timestamp, patch goal, changes made + files touched, breaking changes, regressions introduced/removed, validation performed, final status.

## 2026-07-20T00:00Z — Portfolio-readiness audit + RFC-0025

**Goal:** full-repo analysis to make the project presentable in a Google/Microsoft/bank hiring
loop, then capture the plan as an RFC per this project's own convention (a boundary-moving
decision — VCS adoption, license, test framework, CI, docs-language policy, `workflow.py` module
split — requires an RFC before implementation, not after).

**Changes made:** documentation only, no source code touched.
- Added `.sinapsi/rfc/0025-repository-launch-and-portfolio-readiness.md` — 4-phase plan (Repository
  Foundation → Verifiability → Legibility → Portability), with concrete task lists, a CI workflow
  draft, the exact `workflow.py` functions to unit-test, six RFCs selected for backfill, and an
  explicit Alternatives/Decision/Consequences section per template.

**Files touched:** `.sinapsi/rfc/0025-repository-launch-and-portfolio-readiness.md` (new),
`.sinapsi/session.md`, `.sinapsi/handoff.md`.

**Breaking changes:** none. **Regressions introduced/removed:** none — no code was modified.

**Validation performed:** manual read-through of `client/`, `server/`, `.sinapsi/` to source every
claim in the RFC (RFC citation count verified via full-repo grep = 23 distinct IDs, 0002–0024;
vendored footprint sizes measured with `du -sh`; `LLMProvider` Protocol contract read directly from
`providers/base.py` before proposing Phase 3 against it, to avoid inventing an abstraction that
already exists).

**Final status:** RFC-0025 is **Proposed**, not yet accepted or implemented. No phase has started —
the repository is still not a git repo, still has no README/LICENSE/tests/CI. Next patch should
either begin Phase 0 (if the user wants execution to start) or record acceptance/amendments to the
RFC first.

## 2026-07-20T01:00Z — RFC-0025 execution: Phase 0, 1, and 2 complete

**Goal:** execute RFC-0025 end to end (user sign-off received) — take the repository from "local
folder" to "public, verifiable, presentable" per the accepted plan, treating Phase 0+1 as the
minimum viable slice and Phase 2 as the legibility pass on top of it.

**Changes made:**
- **Phase 0:** `git init -b main`; MIT `LICENSE`; root `README.md`; `docs/DEV.md`; secret sweep
  (clean) + `client/.env.example` + `.env` added to `client/.gitignore` (previously missing).
- **Phase 1:** `server/modules/prompt_enhancer/tests/` (32 pytest cases) +
  `requirements-dev.txt`; `server/tools/{index,fs,runtime}.test.ts` (15 bun test cases, including a
  regression test for the historical nested-`sub_prompts` compression bug); `.github/workflows/ci.yml`;
  `biome.json` + one-time repo-wide format pass; `server/modules/pyproject.toml` (Ruff) + one-time
  fix pass; scoped English translation of module docstrings in the six RFC-0025-named files.
  Two tiny testability refactors: `tools/index.ts` split `discoverTools` into pure
  `filterToolFiles`/`collectTools` (exported); `tools/runtime.ts` exported `collectCompressFields`.
  Neither changes runtime behavior.
- **Phase 2:** `docs/architecture.md` (component diagram, sequence diagram, module table, explicit
  Threat Model — found and documented that the WS server has no auth and no enforced loopback bind,
  which RFC-0025's own threat-model assumption had understated; recommended a fix but did not apply
  it). Backfilled RFC-0002, RFC-0008, RFC-0014, RFC-0015, RFC-0018, RFC-0024, each labeled
  "Accepted (reconstructed)" with sources cited. Split `workflow.py` into `prompts.py` /
  `coercion.py` / `strategies.py` / thinned `workflow.py`, done after and verified by Phase 1's
  suite (32/32 still pass). One deviation from the RFC's literal file assignment
  (`build_compiled_prompt` → `coercion.py`, not `workflow.py`, to avoid a circular import) logged in
  `.sinapsi/decisions.md`.

**Files touched:** ~45 files created/modified across root, `client/`, `server/`, `.sinapsi/`,
`docs/`, `.github/`. Full list is in the 18 commits on `main` (`git log --oneline`).

**Breaking changes:** none — `run_enhancement_field_loop` was copied verbatim (RFC-0005 § crit. 4).
**Regressions introduced/removed:** none observed; every test suite green before and after each
change (verified incrementally, not just at the end).

**Validation performed:** `pytest` (32/32), `bun test` (15/15), `tsc --noEmit` (both packages),
`biome ci .` (0 errors), `ruff check` (0 errors) — all re-run after the workflow.py split
specifically, to confirm the refactor didn't regress anything. Direct Python import check
(`import workflow; import strategies; import coercion; import prompts`) to confirm no circular
import at runtime, not just under pytest's import machinery.

**Final status:** RFC-0025 Phases 0, 1, and 2 are **done and committed** (18 commits, clean working
tree). Phase 3 (stretch) is not started. See `.sinapsi/handoff.md` for what remains, what's fragile,
and the two placeholder values (GitHub badge/RFC-link paths) that need updating once this repo is
actually pushed to a remote.

## 2026-07-22T00:53:47+02:00 — Root portfolio-alignment RFC

**Goal:** give implementation agents a single root-level, portfolio-oriented plan that aligns Cowork
Prompt Enhancer with its intended role as the portfolio flagship, while preserving the authority of
the accepted decision records under `.sinapsi/rfc/`.

**Changes made:** documentation only. Added `RFC.md` with the verified baseline, 20 prioritized
problem statements, target architecture and provider modes, public contracts, explicit simplification
decisions, a five-phase implementation plan, recruiter-facing skill projection, definition of done,
agent operating contract and rejected alternatives. The RFC proposes public ownership, a GPU-free mock
path, OpenAI-compatible provider support, protocol/resource hardening and a reproducible semantic
evaluation harness. It explicitly does not supersede accepted RFCs and freezes new tool categories until
the launch/evaluation gates are closed.

**Files touched:** `RFC.md` (new), `.sinapsi/session.md`, `.sinapsi/handoff.md`,
`.sinapsi/summary.md`. Three sibling portfolio repositories received their own independent root RFCs;
they are outside this repository and do not change Cowork behavior.

**Breaking changes:** none. **Regressions introduced/removed:** none; no source, dependency, protocol,
configuration or generated artifact was changed.

**Validation performed:** verified `RFC.md` structure and problem count; confirmed all referenced
paths exist; confirmed the document is Proposed and subordinate to existing accepted RFCs; checked that
the only repository changes introduced by this patch are the RFC and required Sinapsi memory updates.

**Final status:** root portfolio RFC is documented but not accepted or implemented. The next execution
patch should start with Phase 0 only after explicit user direction, map work to the root RFC problem IDs
and applicable accepted `.sinapsi/rfc/` decisions, and preserve the pre-existing dirty worktree.

### Validation addendum

Sinapsi automatically refreshed tracked `.sinapsi/project-map.md` after root `RFC.md` was created; this
derived change was not manually edited. Final structural validation counted 425 lines and 20 problem
statements in the Cowork RFC, confirmed balanced Markdown fences and all mandatory execution sections,
kept `handoff.md` below 150 lines, and ran `git diff --check` without whitespace errors. Across the four
portfolio projects, the new RFC set totals 1,542 lines and 71 explicitly tracked problems.

## 2026-07-22T04:10:00+02:00 — Root RFC Phase 0: ownership foundation

**Goal:** close P-01 and the repository portions of P-16–P-19 without losing the pre-existing
Sinapsi 0.2.6 and root-RFC worktree changes.

**Changes made:** accepted root `RFC.md`; added a Bun workspace and root command surface; pinned Bun,
Node, Python, Biome, TypeScript and direct dependencies; generated hash-verified Python locks; added
security, contribution, support, release, environment and third-party provenance documentation; corrected
GitHub ownership; consolidated CI on frozen root commands; added a root-command integration test; applied
the previously missing Ruff formatter baseline. Pre-existing Sinapsi-generated changes were preserved.

**Breaking changes:** root installation is now lock-authoritative; package-local locks remain historical.
No runtime protocol or provider behavior changed. **Regressions:** none observed.

**Validation:** frozen install passed; Biome format/lint passed; Ruff format/lint passed; both TypeScript
packages typechecked; 15 Bun server tests, 32 pytest tests and 1 root integration test passed; Bun and
Python audits reported no known vulnerabilities; `git diff --check` passed. Local artifacts and GPU were
present, while the non-running local endpoint correctly reported unreachable.

**Final status:** Phase 0 implementation is complete locally. Remote creation, push and hosted CI are the
remaining external gate actions before Phase 1 begins.

**Validation addendum:** the candidate-file scan exposed root `node_modules/` as newly unignored after
workspace consolidation. Root `.gitignore` now excludes it; a repeat scan found no candidate over 10 MiB.

## 2026-07-22T04:28:00+02:00 — Phase 0 clean-install CI repair

**Goal:** repair hosted CI failure `TS2688` from a clean workspace install. **Change:** both TypeScript
configs now reference public type package `bun`, not its non-hoisted transitive package `bun-types`; the
workspace integration suite enforces this invariant. **Breaking changes:** none. **Validation:** format,
lint, both typechecks, 15 Bun server tests, 32 pytest tests and 2 integration tests pass. **Status:** ready
to push and re-run hosted CI.

## 2026-07-22T04:39:00+02:00 — Phase 0 dependency-audit repair

**Goal:** remove hosted audit finding `PYSEC-2026-1845`. **Change:** upgraded the test runner from
pytest 8.4.1 to 9.0.3 and regenerated the hash-verified development lock. **Breaking changes:** none.
**Validation:** 32 pytest cases pass on 9.0.3; complete local check passes; Bun and pip-audit report zero
known vulnerabilities. **Status:** ready for hosted CI confirmation.
