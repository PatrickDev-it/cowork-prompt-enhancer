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

## 2026-07-22T04:08:46+02:00 — Hosted security and release automation

**Goal:** complete the repository automation portions of P-17, P-19 and P-20 with current hosted-action
runtimes and reproducible tag validation.

**Changes made:** expanded CI to run frozen installation, complete format/lint/type/test gates, offline
preflight/demo/benchmark, dependency audit, repository scan, documentation validation, release build and
checksum validation, then retain the validated bundle. Added matrix CodeQL analysis for TypeScript and
Python, weekly/tag/PR triggers with least-privilege permissions, weekly Dependabot coverage for Bun/npm,
Python and GitHub Actions, and a tag workflow that rebuilds the release from the tagged commit.

Actions use the current official major lines verified on 2026-07-22: checkout v7, setup-python v6,
upload-artifact v7 and CodeQL v4; setup-bun remains the verified v2 line. Contribution and release policy
now require the repository and documentation gates.

**Validation:** all four YAML files parse successfully, Biome/Ruff and formatting pass, 39 Markdown files
validate, the tracked repository scan is green and `git diff --check` passes. Hosted execution remains the
required post-push evidence.

**Final status:** automation is ready to commit and push; repair any hosted CI or CodeQL failure before
continuing to recruiter documentation.

## 2026-07-22T04:12:41+02:00 — Recruiter-first public narrative and provenance alignment

**Goal:** close P-17/P-18 documentation signal and synchronize README, architecture, threat, support and
artifact provenance with measured implementation behavior.

**Changes made:** replaced the long decision-centric README with a 133-line recruiter path covering the
problem, exact local result, three-minute mock quickstart, three provider profiles, compact architecture,
security model, benchmark evidence and material limitations. Claims link raw results and state the local
eight-case lexical scope, latency hardware and recall trade-off. Only four boundary-defining RFCs remain
in the public narrative; reconstructed labels are explicit.

Architecture now documents the model-free CI/release boundary, CycloneDX and complete asset checksums.
Third-party guidance distinguishes workstation validation hashes from separately pinned setup downloads;
support now reflects the stable semantic-versioning policy. The stale llama.cpp build reference in a
runtime comment now points to the authoritative manifest.

**Validation:** full formatter/lint/typecheck passes; 53 Bun unit, 79 pytest and 7 integration tests pass.
All 39 Markdown files and the repository security scan pass; no Italian public-doc copy or placeholder
owner reference remains; `git diff --check` passes.

**Final status:** recruiter documentation is ready to commit/push. Require refreshed CI and CodeQL green,
then execute the clean-clone and GitHub PR/release/publication sequence.

## 2026-07-22T04:15:01+02:00 — Portable line endings for clean Windows clones

**Goal:** make the documented release gate reproducible from a clean Windows checkout under the common
`core.autocrlf=true` configuration.

**Defect found:** the external private-repository clone completed frozen setup, preflight and mock artifact
generation in 8.339 seconds, but the subsequent formatter gate rejected 72 CRLF-converted files. Hosted
Linux CI and the long-lived working tree were green, so only the mandated clean Windows clone exposed it.

**Fix:** root Git attributes now force LF for all auto-detected text, retaining the existing explicit
evaluation-result rule. A workspace integration regression asserts `eol: lf` for root docs/config and
server source through Git's own attribute resolver.

**Validation:** all three workspace contract tests pass, Git resolves LF for every sampled boundary and
`git diff --check` passes. The fix must be committed/pushed before repeating a new clean clone.

**Final status:** clean-clone portability defect fixed locally without altering source semantics.

## 2026-07-22T04:20:04+02:00 — Clean-clone launch gate and CodeQL permission repair

**Goal:** prove the external Windows reviewer path and repair the only remaining hosted security-analysis
failure without broadening repository access.

**Evidence:** a fresh clone of commit `dd838fa` preserved LF attributes, completed the documented mock
quickstart in 8.092 seconds and passed `bun run gate:release` in 93.428 seconds. The clean gate included
format/lint/typecheck, 53 Bun unit tests, 79 pytest tests, 8 integration tests, zero Bun/pip audit findings,
39-file documentation validation, the tracked secret/heavyweight scan, demo recording, 264 benchmark
records, an 11-asset release bundle and clean diff/status checks.

**Hosted defect and fix:** CodeQL analyzed both language matrices but could not read its workflow-run
metadata (`Resource not accessible by integration`). The workflow now grants only `actions: read` in
addition to existing read-only contents and security-event upload permissions. YAML parsing,
documentation links, repository scanning and `git diff --check` pass.

**Final status:** all local implementation and clean-clone gates are complete. Commit/push the permission
repair, require CI and both CodeQL matrices green, then open/merge the mapped PR and publish v1.0.0.

## 2026-07-22T04:26:10+02:00 — Portable CodeQL evidence across repository visibility

**Goal:** keep CodeQL mandatory while respecting GitHub's availability boundary for a personal private
repository and preserving the rule that public visibility is the final launch action.

**Hosted evidence:** push and PR CI both passed, and CodeQL completed TypeScript and Python extraction and
analysis. Both jobs failed only when GitHub rejected SARIF upload because code scanning is unavailable for
this private repository; the previous workflow-metadata permission error is resolved.

**Fix:** CodeQL now always generates language-specific SARIF. While private it retains each result as a
seven-day workflow artifact without requesting the unavailable code-scanning endpoint; once public it
automatically uploads results to native code scanning. The matrix, queries and failure behavior are
unchanged. Official GitHub documentation confirms code scanning availability for public repositories and
the CodeQL `never` upload mode.

**Validation:** workflow YAML and expression structure parse, 39 documentation files validate, the tracked
repository scan is green and `git diff --check` passes.

**Final status:** commit/push the visibility-aware evidence path and require refreshed CI plus both CodeQL
matrices green before merging PR #1.

## 2026-07-22T04:30:58+02:00 — Workspace-relative CodeQL evidence retention

**Goal:** repair the remaining hosted failure after confirming private CodeQL analysis itself succeeds.

**Defect and evidence:** both matrices generated post-processed SARIF successfully, including 28/28 Python
files and 63/63 TypeScript files plus all three workflows. The artifact action then rejected the parent
path `../codeql-results`; current upload-artifact security rules prohibit `..` path traversal.

**Fix:** generate and retain `codeql-results` inside the checked-out workspace. The output is ephemeral to
the hosted runner, language-isolated by the artifact name and never committed. Query execution, failure
handling and the public native-upload branch are unchanged.

**Validation:** workflow YAML parses, documentation links and repository scanning pass, and
`git diff --check` is clean.

**Final status:** push the two-line hosted path correction and require CI plus both CodeQL matrices green.

## 2026-07-22T04:40:02+02:00 — Deterministic hash-locked Python audit

**Goal:** remove the last host-dependent operation exposed by mandatory merged-main verification without
reducing the dependency-audit inventory or acceptance criteria.

**Evidence:** PR #1 merged as `74e511e` after both duplicated CI runs and all four CodeQL jobs passed. A
fresh clone installed from frozen/hash-locked manifests in 6.643 seconds; format, lint, both typechecks,
53 Bun tests, 79 pytest tests and 8 integration tests passed. The release gate then failed solely because
pip-audit's implicit temporary resolver could not bootstrap pip through Windows `ensurepip`. The same
complete lock audited successfully when pip resolution was disabled.

**Fix:** the root audit command now passes `--disable-pip` for the fully transitive, exact-version,
hash-locked `requirements-dev.lock`. This audits every listed component while eliminating an unnecessary
temporary virtual environment. A workspace contract regression enforces the deterministic command.

**Validation:** the new regression passes; Bun and Python audits report zero findings; formatter, Biome,
Ruff, both typechecks and `git diff --check` pass.

**Final status:** push this atomic follow-up branch, merge only after CI/CodeQL, then restart merged-main
clean-clone verification from the corrected commit.

## 2026-07-22T04:59:53+02:00 — Stable public launch and authoritative CodeQL control

**Goal:** complete final verification, release/publication and the public security-control transition, then
leave one manually executable CodeQL source of truth.

**Delivery:** deterministic audit fix PR #11 merged as `8377db3` after both CI runs and both CodeQL
languages passed. A fresh clone of that commit installed in 6.207 seconds and passed the complete release
gate in 30.024 seconds: 53 Bun unit, 79 pytest and 9 integration tests; format/lint/typechecks; zero Bun
and Python audit findings; 39-file docs; repository scan; demo; and 11-asset release validation. Named
suites passed: providers 25/25, protocol/security 26/26, supervisor 5/5 and WebSocket mock E2E 4/4.
The deterministic benchmark produced 264 records, and supported local inference passed in 19.289 seconds.
The final clean clone had no tracked diff or status.

**Release:** annotated tag `v1.0.0` targets `8377db3` (no signing key was configured). Tag CI and release
validation passed. The published stable release contains 11 assets; all ten manifest-covered asset hashes
were independently verified after download. It includes source, changelog, benchmark evidence, 108-item
dependency inventory, CycloneDX 1.6 SBOM, provenance and complete checksums, with no model/runtime binary.

**Public controls:** after release integrity passed, repository visibility changed to public. Secret
scanning, push protection, vulnerability alerts, automated security fixes and private vulnerability
reporting are enabled. `main` enforces strict up-to-date `verify`, TypeScript CodeQL and Python CodeQL
contexts for administrators, blocks force pushes/deletion and requires conversation resolution. Public
native CodeQL completed successfully for both languages.

**Final patch:** the committed advanced CodeQL workflow remains the required source of truth; default
setup was disabled after its public activation proof to avoid duplicate/conflicting analysis. A manual
dispatch trigger now supports explicit reruns. YAML parsing, docs, repository scanning and diff checks pass.

**Final status:** commit/push this workflow-only patch, merge after public CI/CodeQL, dispatch CodeQL once
from `main`, and confirm repository metadata/security/release status. No product code remains open.

## 2026-07-27T15:20:00+02:00 — Search-led product positioning and adoption surface

**Goal:** correct weak search discovery and conversion using the supplied worldwide Google Trends exports,
then align the repository and canonical product page without changing runtime behavior or evidence claims.

**Evidence:** relevant demand clusters around `openai prompt optimizer`, `gpt prompt optimizer`, ChatGPT,
Gemini prompts and Claude Code; the generic `prompt enhancer` query is materially weaker. Photo, image and
video enhancer trends were excluded because they do not match the product. The previous README and landing
led with engineering architecture, while the product outcome, downstream workflow and remote-compute use
case were not stated in search language.

**Delivery:** the README now positions Cowork as an independent open-source AI prompt optimizer for
developers under the motto “Write it rough. Cowork compiles the rest.” It adds a rough-to-structured
example, an accurate compatibility matrix, remote-workstation guidance, vendor-disclaimer language and
search-intent FAQ. `docs/ai-prompt-optimizer-guide.md` adds an indexable, evidence-linked explanation of
prompt optimization, downstream ChatGPT/Gemini/Claude Code/Codex use and local/remote execution.

**Repository discovery:** GitHub API metadata now uses the outcome-led description, enables Discussions
and applies 20 relevant topics spanning prompt optimization, coding agents, local AI and target workflows.
Runtime contracts, provider support, benchmarks and release artifacts are unchanged.

**Validation:** format, lint, both workspace typechecks, 53 Bun unit tests, 79 pytest tests and 9 integration
tests pass. Documentation links, repository security scan and diff checks pass. The canonical site patch
is maintained in the separate `PatrickDev-it.github.io` repository and validates its HTML, JSON-LD,
sitemap, 1200×630 social metadata and IndexNow payload independently.

**Final status:** commit and publish both branches through reviewable PRs, then verify the GitHub Pages
deployment and canonical production metadata.

## 2026-07-27T16:35:00+02:00 — Remote-first product rename and repository migration

**Goal:** remove Cowork from the product identity, move the repository to a search-aligned URL and make the
original two-machine operating model the primary adoption narrative.

**Repository migration:** GitHub API renamed `PatrickDev-it/cowork-prompt-enhancer` to
`PatrickDev-it/ai-prompt-optimizer`. GitHub returns a permanent redirect from the old URL. The local
`origin`, badges, changelog, dataset schema, workflows, release builder, package identities, CLI labels and
canonical portfolio links now target the new identity. The `COWORK_*` configuration namespace and
`cowork-eval/v1` evidence identifier remain compatibility contracts for v1.0.0, not product branding.

**Product positioning:** the product name is Prompt Enhancer. The README states that it was originally
developed in Cowork mode: an always-on, GPU-equipped home workstation runs supervised local inference,
while a MacBook or lighter laptop runs the interactive client from an IDE terminal. The new
`docs/remote-ide-workstation.md` documents private networking, authenticated WebSocket setup, workstation
and portable-client commands, operational controls and the explicit absence of a native IDE extension.

**Public site:** the canonical landing, home card, about card, structured data, FAQ and `llms.txt` now lead
with the remote-first workstation-to-IDE workflow and reference the renamed repository. A new 1200×630
social card visualizes the home-workstation-to-portable-IDE path without Cowork branding.

**Validation:** format, lint, both workspace typechecks, 53 Bun tests, 79 pytest tests, 9 integration tests,
dependency audits, 40-file documentation validation, security scan and deterministic demo pass. Static
site, JSON-LD, social metadata and IndexNow dry-run validation pass. From clean commit `39b7d94`, the
renamed 11-asset `ai-prompt-optimizer-1.0.0-*` bundle builds and validates with complete checksums.

**Final status:** publish both PRs after hosted checks, then verify the new GitHub URL, old redirect and
deployed landing.
