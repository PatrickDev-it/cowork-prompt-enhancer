# Reference benchmark evidence

Both reference runs identify benchmark implementation commit
`1cbbf26b63ea81fedc5a6922453ea00ea75090c8`. Every report links its raw JSONL records,
machine summary and environment metadata.

| Run | Scope | Provider | Records | Primary use |
|---|---:|---|---:|---|
| [Mock full](mock-full-v1/report.md) | 64 cases | `cowork-deterministic-v1` | 264 | Complete, deterministic harness and strategy coverage |
| [Local stratified](local-stratified-v1/report.md) | 8 cases | `Qwen3-8B-Q4_K_M.gguf` | 32 | Real-model comparison across all eight categories |

On the local subset, compiler structural validity is 0.792 versus 0.333 for raw requests and
executability is 0.975 versus 0.725. Explicit-requirement recall is 0.917 versus 1.000; the result
therefore supports a structure/executability improvement on this subset, not unconditional superiority.
All tracked contradiction, invented-specificity and fallback rates are 0.000 for the local compiler.

Metrics are deterministic lexical checks, not human evaluation. The local run is stratified rather
than full-corpus, timing is workstation-specific, and no human rating has been performed. See the
[methodology and blinded-review protocol](../README.md) before deriving any public claim.
