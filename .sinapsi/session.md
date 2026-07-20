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
