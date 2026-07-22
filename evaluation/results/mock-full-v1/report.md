# Benchmark report: mock-full-v1

## Methodology

`cowork-eval/v1` uses deterministic anchor, contradiction, specificity, ambiguity, structure and executability checks. These automated metrics are primary evidence; no model-assisted or human judge was used.

## Dataset and environment

- Tier: `full` (64 cases; architecture, data_ml, debugging, implementation, operations, professional_writing, refactoring, research).
- Provider: `mock` / `cowork-deterministic-v1`.
- Benchmark commit: `1cbbf26b63ea81fedc5a6922453ea00ea75090c8`.
- Raw evidence: [`records.jsonl`](records.jsonl); environment: [`environment.json`](environment.json); machine summary: [`summary.json`](summary.json).

## Deterministic results

| Strategy | Cases | Recall | Precision | Contradiction | Invented specificity | Structure | Executability | Fallback | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `compiler` | 64 | 0.982 | 0.992 | 0.010 | 0.000 | 0.604 | 0.912 | 0.000 | 1.8 | 3.0 |
| `compiler_grounded` | 8 | 1.000 | 0.969 | 0.042 | 0.000 | 0.417 | 0.850 | 0.000 | 2.1 | 3.1 |
| `field_loop` | 64 | 0.982 | 0.988 | 0.010 | 0.005 | 0.604 | 0.909 | 0.000 | 21.7 | 29.8 |
| `raw` | 64 | 0.982 | 0.992 | 0.010 | 0.000 | 0.297 | 0.631 | 0.000 | 0.0 | 0.0 |
| `thin` | 64 | 0.982 | 0.992 | 0.010 | 0.000 | 0.604 | 0.912 | 0.000 | 0.4 | 0.6 |

Compiler success and fallback-delivered success are stored separately in `summary.json`; a successful fallback is never counted as compiler success.

## Limitations

- String anchors are transparent and reproducible but do not measure semantic paraphrases.
- Precision covers tracked explicit requirements versus tracked contradictions/specificity, not every possible claim.
- The executability rubric is deterministic and auditable; it is not human preference or proof of task success.
- Mock results validate the harness and complete comparison, not real-model quality.
- The stratified local tier is an eight-case reference and must not be presented as a full-corpus result.
- Grounding uses embedded, timestamped fixtures; reference runs perform no live retrieval.
- No human evaluation results are claimed. The blinded protocol is available in `evaluation/README.md`.
