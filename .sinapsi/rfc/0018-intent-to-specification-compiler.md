# RFC 0018 — Intent-to-Specification Compiler

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/modules/prompt_enhancer/workflow.py` (`compile_intent`, `COMPILER_PROMPT`,
> `build_specification`, module docstring).
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).

## Context

`workflow.py`'s module docstring records two prior strategies this one supersedes as default:
`field_loop` (RFC-0005 § crit. 4) generates a 13-field `PromptSpec` via 13 sequential model calls,
one per field, plus a `critique` pass — reliable, but slow and expensive per request.
`single_pass` (RFC-0011) collapsed that to one call producing all 13 fields at once, trading a
historical multi-field template for a single generation. Both frame the problem the same way: fill
in a fixed set of fields describing the request.

The mechanism this RFC documents reframes the problem instead of just re-optimizing the older
approaches' execution strategy: an under-specified user request (a sentence, sometimes a fragment)
must become a specification detailed enough for a *second*, separate LLM to execute directly — the
prompt-enhancer's own output is not read by a human, it is fed to another AI as its task
definition. That reframing is what "compiler" names: `COMPILER_PROMPT` opens by defining the model's
role as "an Intent-to-Specification Compiler... a compiler, not a text expander: do not retell the
request, compile it," and explicitly separates what the user said from what the compiler infers on
their behalf, because those two categories need different trust levels downstream.

## Proposal

- **One call does the whole pipeline internally.** `compile_intent(engine, user_input, mode, ...)`
  makes exactly one model call (`COMPILER_PROMPT`) that internally performs extraction, inference,
  domain/technical expansion, and optimization for the receiving LLM — a single-call design
  inherited from `single_pass`'s latency argument (RFC-0011), applied to the new compiler framing
  rather than the old 13-field template.
- **Explicit vs. inferred are different fields, never merged.** The prompt's Inference Rules encode
  a three-tier sort: *Explicit Intent* (what the user actually said) → `known_requirements`;
  *Necessary Completion* (without which the task can't be implemented) and *Professional
  Enhancement* (what a senior engineer would add) → both land in `inferred_requirements`, but never
  mixed into `known_requirements`. This tracks explicit vs. inferred all the way to the rendered
  output (`build_specification`'s `# Known Requirements` / `# Inferred Requirements` sections),
  so the downstream AI — and a human reviewing the spec — can tell what the user actually asked for
  apart from what was filled in on their behalf.
- **Capability over implementation, as a first-class rule, not a style preference.** The prompt is
  explicit: infer *capabilities* ("a secure authentication mechanism", "a typed data-access layer"),
  never specific vendors or libraries (Auth.js, Prisma, Redux, ...) unless the user named one or the
  context narrows the choice to exactly one option. The same discipline applies to compliance
  language: infer "support applicable data-protection regulations," never hardcode GDPR/CCPA/HIPAA
  unless the user or an explicit jurisdiction requires it. This is the compiler's main defense
  against hallucinating specificity the user never asked for.
- **Domain and Technical Expansion are separate, conditionally-applied policies.** Domain expansion
  (infer standard entities/workflows/terminology for a named domain like healthcare or finance)
  always applies when a domain is named. Technical Expansion (infer the implementation dimensions a
  senior engineer would assume — error handling, empty/loading states, accessibility, typing,
  testing) applies *only* when `classify_target(user_input)` — a deterministic, stdlib, zero-model
  EN+IT keyword classifier — says the task kind is `"technical"`. Keeping this classification out of
  the model was itself a decision (see module comment on `_TECHNICAL_SIGNAL`): a model-based
  classifier would reintroduce the serial multi-call chain that RFC-0011 had already eliminated,
  just to decide which policy to apply before generating.
- **Empty sections vanish, they don't render as dangling headers.** `build_specification` renders
  `_COMPILER_SECTIONS` in a fixed order, but skips any section whose value is empty — no
  `# Constraints` header with nothing under it. `known_requirements`/`inferred_requirements`/etc.
  are explicitly allowed to be empty per the prompt's own type rules ("never pad"); the renderer
  respects that instead of manufacturing filler content to avoid an empty section.
- **On parse failure, fall back to the historical, validated path.** `compile_intent` raises
  `ValueError` if the model's output yields no extractable JSON object; the caller
  (`run_enhancement`) catches that and falls through to `run_enhancement_field_loop` — the same
  fallback boundary `single_pass` already established, so a compiler failure costs latency, not
  correctness.

## Alternatives

*(Reconstructed: no rejected alternative is recorded verbatim in the source. The following are the
plausible alternatives this design's shape rules out.)*

- **Keep extending `single_pass`'s fixed 13-field `PromptSpec` shape.** Rejected implicitly by the
  field set itself changing shape (`INTENT_SPEC_FIELDS` vs. `PROMPT_SPEC_FIELDS`) — `role`/
  `objective`/`overall_context` are absorbed into `task`/`context`, and `known_requirements`/
  `inferred_requirements` have no equivalent in the older field-per-fact template. The older shape
  had no room to separate explicit from inferred content, which this RFC treats as load-bearing.
- **Use a model call to classify technical vs. conversational intent.** Rejected per the module
  comment on `_TECHNICAL_SIGNAL`: it would reintroduce a second serial model call purely to decide
  which prompt policy to apply, undoing RFC-0011's single-call latency win for a classification a
  deterministic regex handles adequately.

## Decision

Adopt the Intent-to-Specification Compiler as the default generation strategy
(`COWORK_PROMPT_ENHANCER_STRATEGY=compiler`): one model call, explicit/inferred tracked in separate
fields under strict Inference Rules, capability-over-implementation and domain/technical expansion
policies encoded in the prompt itself, deterministic (non-model) task classification, and a
fallback to `field_loop` on any parse failure.

## Consequences

**Positive:** the rendered specification is dense and unpadded — no boilerplate sections, no
vendor names the user didn't ask for — and legible enough that a human, not just the receiving AI,
can audit what was assumed on the user's behalf versus what they actually requested. Single-call
latency is preserved from RFC-0011 while gaining a materially richer output shape.

**Costs / trade-offs:** the Inference Rules are prompt-enforced, not code-enforced — a rule like
"never name a specific vendor" can only be as reliable as the model's adherence to it; there is no
programmatic check that `inferred_requirements` never contains a rejected product name. Compiler
failures are opaque to the fallback: `run_enhancement` catches any exception and silently retries
via `field_loop`, which means a systematic compiler problem (e.g. a prompt-template regression)
would show up as consistently slower responses via `debug.generation_mode`, not as a hard error a
caller would notice without inspecting that field.
