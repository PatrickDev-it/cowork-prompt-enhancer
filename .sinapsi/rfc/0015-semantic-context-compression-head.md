# RFC 0015 — Semantic Context-Compression HEAD

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/tools/runtime.ts`, `server/modules/context_compressor/index.ts`,
> `server/tools/types.ts` (`PromptDescriptor.compress`).
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).

## Context

Some tool inputs are large by nature — `dev-prompt-enhancer`'s `project-select` prompt (RFC-0021)
can bundle an entire local codebase's worth of file contents into a single string field. Two
problems follow directly from that, both documented inline in `context_compressor/index.ts`'s
module comment: prefill of a huge input is model-bound and slow, and an input larger than a single
inference slot's context window (RFC-0024 sizes slots at ~10k tokens) would not fit at all,
regardless of speed.

A real regression is cited directly in `tools/runtime.ts`'s `collectCompressFields` doc comment: an
18k-token raw code payload reaching the compiler pushed prefill past the compiler's 600-second HTTP
timeout, silently falling back to the slower `field_loop` strategy (RFC-0018) — a correctness-
adjacent failure (the user still got a result, just via the wrong path, slower and without the
compiler's quality characteristics) that only large inputs could trigger, and that no per-module
fix could address without every module reimplementing the same truncation/summarization logic.

## Proposal

- **Compression as a declarative, cross-cutting HEAD — not a per-module concern.** A
  `PromptDescriptor` can set `compress: true` on any field (`tools/types.ts`); the module that owns
  that field does nothing special to benefit from it. `tools/runtime.ts`'s `registerTool` runs
  `compressToolInputs` before `tool.run` is ever invoked, so every module — `prompt_enhancer` today,
  any future one — gets the condensed value transparently, with zero logic of its own.
- **Recursive collection, because the bug that motivated this was exactly a recursion miss.**
  `collectCompressFields` walks `PromptDescriptor.sub_prompts` recursively, not just
  `tool.prompts`'s top level — the historical bug was a `compress: true` field reachable only
  through a conditional branch (`sub_prompts['read-project']`), which a shallow scan would miss
  entirely. The regression test for this exact shape lives in `tools/runtime.test.ts`.
- **Condensation is a two-stage map/reduce over the shared model, not a heuristic truncation.**
  `context_compressor/index.ts`'s `compressContext(text)`: if `countTokens(text)` is under
  `COWORK_COMPRESS_THRESHOLD_TOKENS` (default 8192), the input passes through untouched — this is
  an opt-in cost, not a tax on every request. Above threshold, the text is chunked (~6000 tokens per
  chunk, cut on newline boundaries where reasonably close), each chunk is extracted concurrently
  (`mapPool`, default concurrency 3) into dense factual bullet points via a system prompt that
  explicitly preserves architecture, public APIs, data models, dependencies, constraints, and open
  TODOs verbatim, and the per-chunk extracts are then synthesized into one coherent, de-duplicated
  markdown briefing targeting `COWORK_COMPRESS_TARGET_TOKENS` (default 6000).
- **Explicitly lossy, by design.** The module comment states this directly: compression keeps the
  load-bearing essentials and discards the redundant. This is a deliberate trade — the alternative
  (reject oversized input, or truncate blindly) either blocks the user's request or drops content
  with no attempt at prioritizing what matters.

## Alternatives

*(Reconstructed: no rejected alternative is recorded verbatim in the source. The following are the
plausible alternatives this design's shape rules out.)*

- **Truncate oversized input (keep the first/last N tokens).** Would be far cheaper, but for a
  codebase bundle specifically, the load-bearing information (architecture, public interfaces) is
  not reliably concentrated at either end of the concatenated file contents — a blind truncation
  could easily drop exactly the sections the compiler needs.
- **Let each module implement its own size handling.** Rejected by the cost of the bug this RFC
  fixes: it already happened once, in one module, via a code path (`sub_prompts`) easy to miss —
  making every future module re-derive that same correctness property was judged worse than
  building it once as a HEAD every module gets automatically.
- **Reject oversized requests outright with a client-facing error.** Would push the problem back
  onto the user (manually trim their own input) for a case — large local codebases — that is
  exactly the scenario `dev-prompt-enhancer` (RFC-0021) exists to support.

## Decision

Adopt a declarative (`compress: true`), recursive, cross-cutting compression HEAD that runs before
any tool executes, backed by a two-stage extract-then-synthesize pipeline over the shared LLM
(RFC-0014), opt-in via a token threshold so small inputs pay nothing.

## Consequences

**Positive:** the historical 18k-token regression cannot recur through a code path this system
declares `compress: true` on, at any nesting depth — enforced by a regression test, not just
documentation. New modules with large-input fields get this for free by declaring the field, with
no per-module compression logic to write or maintain.

**Costs / trade-offs:** compression is lossy and costs extra LLM calls (one per chunk, plus one
synthesis call) on top of the primary request — acceptable because it only activates above the
token threshold, and the alternative (an unusable or timed-out request) is strictly worse. The
condensed output is only as good as the extraction system prompt's judgment of what's "load-
bearing" — a genuinely load-bearing detail phrased unusually could still be dropped, since this is
model-driven summarization, not a lossless transform.
