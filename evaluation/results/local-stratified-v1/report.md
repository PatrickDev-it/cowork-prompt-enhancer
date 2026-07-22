# Benchmark report: local-stratified-v1

## Methodology

`cowork-eval/v1` uses deterministic anchor, contradiction, specificity, ambiguity, structure and executability checks. These automated metrics are primary evidence; no model-assisted or human judge was used.

## Dataset and environment

- Tier: `stratified` (8 cases; architecture, data_ml, debugging, implementation, operations, professional_writing, refactoring, research).
- Provider: `local` / `Qwen3-8B-Q4_K_M.gguf`.
- Benchmark commit: `1cbbf26b63ea81fedc5a6922453ea00ea75090c8`.
- Raw evidence: [`records.jsonl`](records.jsonl); environment: [`environment.json`](environment.json); machine summary: [`summary.json`](summary.json).

## Deterministic results

| Strategy | Cases | Recall | Precision | Contradiction | Invented specificity | Structure | Executability | Fallback | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `compiler` | 8 | 0.917 | 1.000 | 0.000 | 0.000 | 0.792 | 0.975 | 0.000 | 8673.6 | 11968.1 |
| `field_loop` | 8 | 0.875 | 1.000 | 0.000 | 0.000 | 0.750 | 1.000 | 0.000 | 27472.4 | 42109.7 |
| `raw` | 8 | 1.000 | 1.000 | 0.000 | 0.000 | 0.333 | 0.725 | 0.000 | 0.0 | 0.0 |
| `thin` | 8 | 0.875 | 1.000 | 0.000 | 0.000 | 0.417 | 0.775 | 0.000 | 540.5 | 646.8 |

Compiler success and fallback-delivered success are stored separately in `summary.json`; a successful fallback is never counted as compiler success.

## Limitations

- String anchors are transparent and reproducible but do not measure semantic paraphrases.
- Precision covers tracked explicit requirements versus tracked contradictions/specificity, not every possible claim.
- The executability rubric is deterministic and auditable; it is not human preference or proof of task success.
- Mock results validate the harness and complete comparison, not real-model quality.
- The stratified local tier is an eight-case reference and must not be presented as a full-corpus result.
- Grounding uses embedded, timestamped fixtures; reference runs perform no live retrieval.
- No human evaluation results are claimed. The blinded protocol is available in `evaluation/README.md`.
