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

## 2026-07-22T04:48:00+02:00 — RFC-0026 provider profiles

**Goal:** decide the Phase 1 public provider/configuration boundary before implementation. **Change:**
accepted RFC-0026 defining mock/local/openai-compatible profiles, typed failures, compatibility aliases,
preflight and conformance requirements. **Breaking changes:** mock becomes the reviewer default; explicit
local deployments select `local`. **Validation:** RFC cross-checked against root P-02/P-03/P-16/P-19 and
RFC-0014. **Status:** boundary accepted; implementation next.

## 2026-07-22T02:05:52+02:00 — Root RFC Phase 1: portable providers and reviewer path

**Goal:** close P-02, P-03 and the Phase 1 portions of P-16/P-19 with a GPU-free reviewer path while
preserving the accepted local supervisor contract.

**Changes made:** implemented validated `mock`, `local` and `openai-compatible` profiles behind the
Python provider contract; added stable typed provider failures and credential redaction; added
deterministic failure injection, remote/local HTTP adapters and shared conformance tests; made mock the
default; added fail-fast TypeScript configuration validation, profile-aware worker/supervisor startup,
cross-platform setup scripts, checksum-pinned artifact provenance, capability/health preflight, offline
demo and local smoke commands. Public documentation and CI now expose the same paths.

**Breaking changes:** default provider changes from implicit local inference to explicit deterministic
mock. Legacy provider names remain supported for one release. No workflow strategy or field-loop code
changed. **Regressions:** none observed.

**Validation:** root formatter/lint/typecheck pass; 20 Bun unit, 59 pytest provider/workflow, and 3
integration tests pass; mock preflight/demo pass; real RTX 3070 Ti local preflight validates executable
and model SHA-256 values and the real local smoke generates an artifact; zero orphan llama-server
processes remain. Setup PowerShell/Bash syntax and upstream archive layout/checksums were validated.
Bun audit and pip-audit report zero known vulnerabilities; `git diff --check` passes.

**Final status:** Phase 1 is complete locally. Push the feature commit and require hosted CI green before
beginning the Phase 2 protocol/security implementation governed by a new boundary RFC.

## 2026-07-22T02:15:00+02:00 — RFC-0027 protocol and resource-hardening boundary

**Goal:** decide Phase 2 public protocol, authentication, scheduling, cancellation, confinement and
supervisor invariants before changing accepted runtime boundaries.

**Change:** accepted RFC-0027. It defines loopback-by-default binding; explicit authenticated remote
operation using single-use HMAC challenges; protocol-v1 discriminated envelopes and stable errors;
frame/payload, queue and concurrency bounds; cancellation and reconnect deduplication; canonical
filesystem confinement; and an injectable supervisor state machine.

**Breaking changes:** legacy unversioned WebSocket frames will be rejected because client and server are
released together. Tool wrapper APIs and the Python field-loop workflow remain stable. **Validation:**
cross-checked against root P-04–P-07, P-11–P-13/P-15 and accepted RFC-0002/0008/0014. **Status:** boundary
accepted; implementation is next.

## 2026-07-22T02:45:57+02:00 — Root RFC Phase 2: protocol, security and resource hardening

**Goal:** close P-04–P-07, P-11–P-13 and the Phase 2 portions of P-15 under RFC-0027.

**Changes made:** implemented shared discriminated protocol-v1 schemas and stable errors; explicit
loopback binding; single-use HMAC remote challenges with constant-time verification, expiry and replay
rejection; frame/payload limits; bounded global/per-session scheduling, queue deadlines, cancellation,
status backpressure and reconnect deduplication; explicit client connection states with capped jittered
backoff and bounded outbox; correlation IDs from WebSocket through Python/provider; canonical path
confinement including Windows reserved names and symlink/junction rejection; and an injectable
llama-supervisor state machine. Architecture, threat model, environment and security guidance now match.

**Breaking changes:** legacy `{event, props}` frames are rejected; client and server must ship together.
Local zero-configuration operation remains functional. Cancelling one provider request terminates the
shared Python worker, safely failing its concurrent work without automatic replay. The historical
field-loop code is unchanged. **Regressions:** tool auto-discovery now excludes `*.test.ts`, fixing a
server-start defect exposed by the new colocated tests.

**Validation:** formatter/lint/typecheck pass; 46 Bun unit, 62 pytest and 7 integration tests pass.
Named gates pass: 25 provider, 26 protocol/security/path, 5 supervisor failure-injection and 4 full E2E
tests. E2E covers WebSocket→tool→Python→mock→artifact, anonymous/replayed remote rejection, provider
cancellation and server restart/client reconnect without replay. Real local inference smoke passes;
zero llama-server/Python orphans remain. Bun/pip audits are zero, secret-pattern scan has no matches and
`git diff --check` passes.

**Final status:** Phase 2 is complete locally. Commit/push, require hosted CI green, then implement the
versioned evaluation system before changing compiler prompts.

## 2026-07-22T02:55:00+02:00 — RFC-0028 evaluation evidence boundary

**Goal:** define dataset, result storage, metrics and evidence governance before implementing Phase 3 or
changing compiler prompts.

**Change:** accepted RFC-0028. It specifies `cowork-eval/v1`, a balanced 64-case public dataset, complete
deterministic mock comparisons, a declared stratified local tier, auditable requirement/hallucination/
structure/executability/fallback/timing metrics, fixture-only grounding provenance, immutable raw/result/
environment/report artifacts and a blinded human-review exchange without fabricated results.

**Breaking changes:** none; evaluation is additive and the historical field-loop remains unchanged.
**Validation:** cross-checked against root P-08–P-10, P-14/P-15 and the Phase 3 acceptance gate.
**Status:** evidence contract accepted; corpus and runner implementation are next.

## 2026-07-22T03:15:15+02:00 — Root RFC Phase 3 evaluation implementation

**Goal:** implement RFC-0028 and close P-08–P-10, P-14 and evaluation/observability portions of P-15
without tuning prompts or altering the historical field-loop.

**Changes made:** added the 64-case balanced `cowork-eval/v1` JSONL corpus and schema; deterministic
requirement, contradiction, specificity, ambiguity, structure and executability metrics; complete raw,
thin, compiler, field-loop and fixture-grounded comparisons; credential-free per-provider token/timing
observations; compiler/fallback/parse-recovery separation; timestamped source provenance; machine-readable
records/environment/summary/report outputs; a blinded randomized CSV review exchange; and supervised
mock/local benchmark commands. CI and developer/architecture guidance now include the offline tier.

**Breaking changes:** none. Evaluation is additive, live retrieval is disabled in reference runs and
`run_enhancement_field_loop` is unchanged. **Regressions:** none observed.

**Validation:** formatter, Biome/Ruff, client/server typecheck and all existing gates pass; pytest rises
from 62 to 77 and then 80 targeted tests with observability/benchmark additions, while 46 Bun unit and 7
integration tests remain green. The full mock tier produces 264 records across 64 cases. A real RTX 3070
Ti stratified run completes 32 records across all eight categories: compiler recall 1.000, structure
0.833 and executability 0.975 versus raw structure 0.333 and executability 0.725; this is explicitly an
eight-case lexical-metric reference, not human evaluation or full-corpus proof. No orphan llama-server
remains.

**Final status:** Phase 3 implementation is ready for an atomic source commit. Regenerate sanitized mock
and local reference evidence against that commit, then complete the Phase 4 recruiter/release gates.

## 2026-07-22T03:17:25+02:00 — Evaluation artifact hygiene

**Goal:** prevent local Python test caches from entering Phase 3 commits or release evidence.

**Change:** added repository-wide `__pycache__/` and `*.py[cod]` ignore rules after the pre-commit
untracked-file inventory identified bytecode generated by evaluation tests. Existing local cache files
remain ignored workstation state and are not staged. **Breaking changes:** none. **Validation:** the
untracked inventory now exposes only evaluation source/data/tests and the local benchmark script.

**Final status:** Phase 3 source is ready to commit without generated Python artifacts.

## 2026-07-22T03:27:34+02:00 — Phase 3 reference evidence publication

**Goal:** publish traceable mock and real-local evidence against the committed Phase 3 implementation.

**Changes made:** generated `mock-full-v1` with 264/264 successful records across 64 cases and all five
applicable strategies; generated `local-stratified-v1` with 32/32 successful records across eight
categories and four core strategies; recorded commit `1cbbf26b63ea81fedc5a6922453ea00ea75090c8`, Python/OS/GPU
metadata, provider/model identity and the validated model SHA-256; added an evidence index and enforced
LF for curated results. Raw JSONL contains no workstation absolute path or credential.

**Result:** on the local subset, compiler recall/precision/structure/executability are
0.917/1.000/0.792/0.975 versus raw 1.000/1.000/0.333/0.725. Compiler p50/p95 are 8.674/11.968 s,
with zero tracked contradiction, invented-specificity or fallback rate. This supports a measured
structure/executability improvement with an explicit lexical-recall trade-off, not overall superiority.

**Validation:** root format/lint/typecheck pass; 46 Bun unit, 78 pytest and 7 integration tests pass;
Bun/pip audits report zero vulnerabilities; 296/296 reference records are successful and sanitized;
`git diff --check` passes. No human or model-assisted rating is claimed and no local process remains.

**Final status:** Phase 3 is complete. Commit/push evidence, require hosted CI green, then execute Phase 4.

## 2026-07-22T03:50:09+02:00 — Bounded production request observability and English runtime surface

**Goal:** close the production-observability portion of P-15 and the public-language portion of P-18
before packaging the portfolio release.

**Changes made:** added a correlation-scoped request trace spanning scheduler queue, compression,
provider queue, Python generation/provider calls, tokens, fallback/grounding state, artifact delivery and
total time. Traces are recorded in a bounded 100-entry registry, structured local logs and an opt-in
loopback-only `/metrics` endpoint; prompts, credentials and authentication material are never retained.
Python provider observations are now thread-local. Runtime prompts, errors, logs and comments in every
touched module are professional English. Architecture, environment and security guidance document the
new boundary.

**Security and compatibility:** metrics are disabled by default and configuration rejects them on a
non-loopback bind. Provider contracts, protocol v1 and artifact formats are unchanged. The historical
field-loop remains untouched.

**Validation:** format, Biome/Ruff, client/server typecheck, 47 Bun unit, 79 pytest and 7 integration
tests pass. The full mock E2E verifies a single sanitized trace from WebSocket through artifact delivery;
the Python concurrency regression proves per-thread observations. Bun and pip audits report zero known
vulnerabilities and `git diff --check` passes.

**Final status:** P-15 observability and applicable P-18 English output are complete; Phase 4 packaging,
demo, recruiter documentation and GitHub release work remain.

## 2026-07-22T04:01:42+02:00 — Reproducible demo and release evidence gate

**Goal:** implement the Phase 4 delivery mechanism for a recruiter-verifiable demo and license-safe,
auditable release assets.

**Changes made:** added tracked Markdown link/heading validation, high-confidence credential scanning,
forbidden environment/model/binary/key/oversize artifact checks, and unit regressions. Added a
cross-platform sanitized terminal recording that executes mock preflight, compiler success, deterministic
malformed-output fallback, artifact delivery and the full 64-case benchmark. The single-shot Python CLI
now exposes its non-sensitive generation mode so the demo proves the actual fallback path.

Added a deterministic v1.0.0 release builder and validator. It produces committed-source and benchmark-
evidence archives, changelog, license, third-party provenance, mock/local reports, a 108-component
dependency inventory, CycloneDX 1.6 SBOM, release manifest and complete SHA-256 coverage. It rejects dirty
official builds and any tracked forbidden artifact. Root command and developer documentation expose the
complete gate.

**Validation:** 53 Bun unit, 79 pytest and 7 integration tests pass; Biome/Ruff, typecheck, documentation
links and repository scan are green. The demo records 264 mock benchmark results and proves
`single_generic_prompt_template` with `Fallback used: true`. A pre-commit bundle contains 11 validated
files and all checksum entries recompute successfully; `git diff --check` passes.

**Final status:** Phase 4 delivery tooling is ready for an atomic commit. Hosted automation, recruiter
README/docs synchronization and the final GitHub launch remain.

## 2026-07-22T04:04:50+02:00 — Inert security-scan test fixtures

**Goal:** repair the official post-commit release gate without weakening credential detection.

**Change:** the committed credential and private-key regression literals correctly triggered the
repository scanner. Tests now construct the same sensitive-shaped inputs from inert string fragments,
so the scanner continues to prove detection while its own tracked source is safe to scan.

**Validation:** both credential-scan regressions pass, the full tracked repository scan is green and
`git diff --check` passes. Detection rules and release strictness are unchanged.

**Final status:** commit this regression fix, then rerun the clean official release gate.
