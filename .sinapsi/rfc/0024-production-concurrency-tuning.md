# RFC 0024 — Production Concurrency Tuning

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/config.ts` (`llamaServerArgs`).
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).
>
> All figures below are measured, not estimated — benchmarked 2026-07-08 on an RTX 3070 Ti (8 GB
> VRAM), llama.cpp build b9917, model Qwen3-8B dense, Q4 quantization, KV cache type `q4_0`, as
> recorded inline in `server/config.ts`.

## Context

`llamaServerArgs()` builds the flag set `server/modules/llm/supervisor.ts` (RFC-0014) passes to the
`llama-server` child process. Every flag is a real constraint trade-off on an 8 GB consumer GPU
serving a target of 3-4 concurrent users, and the comment history in `config.ts` shows each one was
tuned against measured numbers rather than left at a framework default.

## Proposal

- **`--parallel 4`.** Continuous batching across 4 slots was chosen over the alternatives measured:
  a single user still gets ~84 tok/s regardless (idle slots don't slow a lone request down), 4
  concurrent users get ~47 tok/s each, fairness across them measured 0.96–1.00, TTFT ~0.5s, and no
  request queues up to 4 concurrent users. `--parallel 3` matches this at ≤3 active users but forces
  a queue for the 4th; beyond 5 slots wasn't pursued because the target load is 3-4 users, not more.
- **`--ctx-size 40960`** = 4 slots × 10240 tokens/slot. This is the largest context that fits safely
  at `--parallel 4` on 8 GB: the measured VRAM curve (Q4 weights, `q4_0` KV) is 32768→6.6 GB,
  **40960→7.2 GB (~1 GB headroom)**, 49152→7.6 GB, 65536→7.8 GB (tight) — KV grows ~490 MiB per
  +8192 tokens. 40960 was picked to leave headroom for decode buffers and the desktop environment
  while staying at or under the model's own 40960-token coherence ceiling. For inputs that need more
  room than a 4-way split allows (large codebases via `dev-prompt-enhancer`, RFC-0021), the lever is
  lowering `--parallel` for bigger per-slot budgets: 2 slots → 20480 tokens/slot (~72 KB of text), 1
  slot → the model's full 40960 (~150 KB) — a manual trade of concurrency for per-request context,
  not something the server switches automatically.
- **`--cache-type-k q4_0 --cache-type-v q4_0`.** Quantizing the KV cache halves its variable memory
  cost, which is what makes the 40960-token context affordable at all on 8 GB — measured with no
  detectable quality regression on this project's task (structured JSON generation, not open-ended
  long-form writing).
- **Q4 model weights over Q5.** Q5 measured at 5.85 GB (−0.8 GB headroom vs. Q4) and −23% decode
  throughput — a strictly worse trade on both axes for this GPU, so Q4 was kept despite the lower
  nominal quantization.
- **`--batch-size 2048 --ubatch-size 512`.** Sized for fast prefill (~3000+ tok/s measured, TTFT
  ~0.5s on a ~1.5k-token prompt) — relevant because the compiler's fixed prompt prefix (RFC-0018) is
  itself a few hundred tokens before any user input is added.
- **`--cache-reuse 256`.** Prefix-cache reuse is active on the dense 8B model (the prior hybrid
  model this project used disabled it — see RFC-0023's context, not reconstructed here). This
  directly compounds with RFC-0018's `COMPILER_PROMPT`, which is deliberately structured with the
  entire fixed instruction block first and only the variable request content at the end, specifically
  so the shared prefix's KV can be reused across requests under this flag.
- **`--gpu-layers 999`.** All model weights on GPU (~5 GB at Q4); the difference between total model
  VRAM (~5.9 GB) and the prior hybrid model's (~7.9 GB) is what created the headroom this whole
  configuration spends on context size instead.
- **Speculative decoding investigated and deliberately left off.** `--spec-type draft-simple` (the
  flag needed — the default `none` means `-md` alone is silently ignored) was tested and does
  measurably work: acceptance statistics appear in the timings. But it's a net regression on this
  GPU/build in every configuration measured: draft-simple 6.4–44 tok/s, n-gram 72–83, against an
  86 tok/s baseline. The baseline is already near the model's own bandwidth ceiling and reuses CUDA
  graphs between calls; speculative decoding varies batch size every round, forcing graph
  recompilation plus a draft-model forward pass whose overhead outweighs its acceptance gain at this
  model size. The `Qwen3-0.6B` draft model stays vendored in `models/` for future revisiting if a
  build changes this trade-off, but is not wired into the default flags.

## Alternatives

- **A larger, sparser (MoE/hybrid) model instead of a dense 8B.** Rejected per RFC-0023's context
  (not reconstructed in this backfill batch) — the prior hybrid model measured worse decode and
  prefill throughput and disabled prefix-cache reuse entirely, which this RFC's `--cache-reuse 256`
  depends on.
- **Speculative decoding, since it does functionally work.** Rejected on measured throughput alone,
  not on principle — the investigation and its numbers are kept inline specifically so a future
  build/GPU change that shifts this trade-off can be re-evaluated against a documented baseline
  instead of re-investigated from zero.
- **A larger `--ctx-size` at the cost of fewer parallel slots, as the default.** Rejected as the
  *default* because the target load (3-4 concurrent users) is a product decision, not just a
  hardware ceiling — but explicitly left as a documented, manual override for the large-input case
  rather than making 40960/4-slots the only supported configuration.

## Decision

Adopt `--parallel 4`, `--ctx-size 40960`, `q4_0` KV cache, Q4 model weights, `--batch-size 2048
--ubatch-size 512`, `--cache-reuse 256`, `--gpu-layers 999`, and no speculative decoding, as the
production default for an 8 GB GPU serving 3-4 concurrent users — every value overridable via
environment variable, none hardcoded past the flag layer.

## Consequences

**Positive:** the configuration is reproducible and falsifiable — every number here has a specific
measured benchmark behind it (see the header), not a rule of thumb, so a hardware or model change
has a concrete baseline to re-measure against rather than a vague "tune it again."

**Costs / trade-offs:** this configuration is specific to one GPU class (8 GB, RTX 3070 Ti tested)
and one model (Qwen3-8B dense, Q4). Deploying on materially different hardware (more/less VRAM, a
different architecture) would need the same benchmark exercise repeated, not just the flags copied
— the values are correct for the measured conditions, not universal constants. The 40960-token
ceiling at the default `--parallel 4` is a real limit for very large inputs; the documented manual
lever (lowering `--parallel`) trades away concurrency to raise it, and nothing in the current system
does that trade automatically based on input size.
