# RFC 0028 — Versioned evaluation evidence

> Status: **Accepted** — 2026-07-22
> Scope: root RFC P-08–P-10, P-14 and evaluation/observability portions of P-15
> Preserves: RFC-0018 compiler and the unchanged RFC-0005 field-loop implementation

## Problem

Well-formed output is not evidence that the compiler preserves requirements, avoids invented specificity
or improves executability. Existing fallback behavior can also hide compiler failure. A public benchmark
needs stable data/result formats before any prompt tuning or performance claim.

## Decision

Adopt `cowork-eval/v1` with a public 64-case JSON dataset: eight cases in each of implementation,
debugging, refactoring, architecture, operations, data/ML, research and professional writing. Every case
contains the original request; explicit requirement anchors; forbidden/invented specificity markers;
acceptable conservative inferences; expected sections; ambiguity/freshness flags; optional project
context; and optional timestamped grounding fixtures with source URLs. Fixtures contain no proprietary,
sensitive or excessive source text.

The full deterministic tier compares raw request, thin one-call baseline, compiler, forced field-loop and
fixture-grounded compiler where applicable. CI runs the entire tier with the deterministic mock. A
stratified local reference tier (at least one case per category) compares the same core strategies on the
available pinned local provider; its subset is explicit and is not presented as a full-dataset result.

Primary metrics are deterministic: explicit-requirement anchor recall/precision, contradiction and
forbidden-specificity rates, unresolved ambiguity, expected-section validity, an auditable executability
rubric, compiler/fallback success, parse recovery, search activation/provenance, provider calls/tokens,
queue/generation/total timing and latency p50/p95. Facts are stored separately as explicit, conservative
inferences and external grounding. Any future model judge must be labeled `model_assisted`; it cannot be
reported as human evaluation.

Each run writes immutable JSON Lines raw records plus `summary.json`, `environment.json` and a Markdown
report under a run ID containing dataset version, provider/model/checksum, benchmark commit, runtime/OS,
strategy outcome and limitations. Curated reference results are release evidence, not user-generated I/O;
they must contain no credential, local absolute path or private input.

A blinded CSV exchange randomizes system labels behind opaque output IDs. The importer validates ratings
and reviewer pseudonyms; no human score is published until a real completed file is imported.

## Alternatives rejected

- Model-only judging: non-deterministic and not equivalent to human review.
- One aggregate quality score: conceals recall/hallucination/fallback trade-offs.
- Live web search in reference runs: irreproducible and unsafe for provenance claims.
- Full 64-case field-loop on every GPU run: excessive cost; use the declared stratified local tier while
  retaining complete mock coverage.

## Falsification

This decision is wrong if the same dataset/provider/config produces structurally different metrics,
published claims cannot be traced to raw records, compiler and fallback success are conflated, grounded
facts lack URL/query/timestamp provenance, or a report implies unperformed human evaluation.
