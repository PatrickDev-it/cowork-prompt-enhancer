# Evaluation

`cowork-eval/v1` is a public 64-case dataset with eight cases in each of implementation,
debugging, refactoring, architecture, operations, data/ML, research and professional writing.
The primary evidence is deterministic and can be traced from the report to each raw JSONL record.

## Reproduce the complete offline tier

```bash
bun run benchmark
```

This compares the raw request, thin single-pass baseline, compiler, historical field-loop and
fixture-grounded compiler where a case has timestamped sources. Output goes to
`.artifacts/benchmark/mock`; pass explicit `evaluation/benchmark.py` options for a different run.
Reference evidence is under `evaluation/results/`.

## Local stratified tier

```bash
bun run benchmark:local
```

The supervised command starts the configured `llama-server` when needed, selects one case per
category and compares the four core strategies. It stops only the process it started. This tier is
an eight-case reference, not a full-corpus claim.

## Deterministic rubric

- Explicit recall requires every declared anchor for a requirement.
- Precision is matched explicit requirements divided by matched requirements plus tracked
  contradictions and forbidden specificity.
- Ambiguity, expected sections, contradiction and specificity markers are direct string checks.
- Executability is the mean of five published checks: actionability, at least two-thirds recall,
  at least half the expected structure, validation language and no tracked hallucination.
- Compiler success and fallback-delivered success are separate fields.
- Provider calls, tokens, generation, queue and total latency are recorded per case.

These metrics are transparent but lexical: a valid paraphrase can be missed, and an unlisted
unsupported claim can escape detection. They are evidence, not proof that a downstream task succeeds.

## Blinded human-review protocol

1. Export randomized outputs with an opaque ID and keep the mapping away from reviewers:

   ```bash
   python evaluation/human_review.py export --records <records.jsonl> --review review.csv --mapping mapping.json
   ```

2. Give reviewers the case and output, but no strategy identity. They enter a pseudonym and rate
   requirement preservation, non-invention and executability from 1 (poor) to 5 (strong). Notes are optional.
3. Import only a complete file; the importer rejects missing pseudonyms, invalid ratings, duplicates,
   unknown IDs and incomplete review sets:

   ```bash
   python evaluation/human_review.py import --review review.csv --mapping mapping.json --output reviews.jsonl
   ```

Reviewers should work independently, use only the stated case and its supplied grounding fixture,
and disclose conflicts. No human result is published until an actual completed file is imported.
