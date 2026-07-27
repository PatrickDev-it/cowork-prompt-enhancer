# AI Prompt Optimizer for Developer Workflows

An AI prompt optimizer converts an incomplete request into a prompt that another model can execute with
less ambiguity. For software work, that means preserving the developer's intent while making
requirements, constraints, assumptions, implementation steps and acceptance criteria explicit.

Cowork is an open-source intent-to-specification compiler for this workflow. Its operating principle is
simple: **write it rough; Cowork compiles the rest.**

## Prompt enhancer versus prompt optimizer

A prompt enhancer commonly rewrites text to sound richer. A prompt optimizer should improve execution
conditions without inventing product decisions. Cowork therefore treats optimization as a bounded
compilation problem:

1. preserve explicit requirements;
2. identify missing decisions;
3. add only bounded assumptions;
4. define observable completion criteria;
5. deliver a valid prompt even when model output is malformed.

That distinction matters for implementation, debugging, refactoring, architecture and operations tasks,
where plausible but unsupported detail can be more harmful than a short prompt.

## Using optimized prompts with ChatGPT, Gemini and coding agents

Cowork's output is vendor-neutral text. A compiled prompt can be reviewed and then pasted into ChatGPT,
Gemini, Claude Code, Codex or another AI coding agent. These are downstream execution targets, not native
Cowork provider integrations.

Cowork itself supports three inference profiles:

- `mock` for deterministic, credential-free evaluation and demos;
- `local` for private inference through a supervised llama-server;
- `openai-compatible` for an explicitly configured compatible endpoint.

This separation avoids coupling prompt quality to a single model vendor. It also makes it possible to
compare the same raw request and compiled specification across different executors.

## Local and remote GPU execution

The client and inference server are separate. A developer can work from a lightweight machine while a
larger local model runs on a more powerful Windows or Ubuntu workstation. Loopback remains the default
network boundary. Non-loopback operation requires explicit activation and short-lived, single-use HMAC
authentication; private networking and TLS termination remain operator responsibilities.

This mode is useful when a team wants shared compute without automatically sending request content to a
third-party service.

## What Cowork measures

The published reference compares raw requests, a thin rewrite, the compiler and a deterministic fallback.
On eight stratified local cases using Qwen3-8B Q4_K_M, structural validity increased from 0.333 to 0.792
and the executability rubric from 0.725 to 0.975 versus the raw request. Explicit-requirement precision
remained 1.000 and recall changed from 1.000 to 0.917.

These are lexical metrics on a small local sample, not human preference ratings or proof of universal
downstream improvement. The
[methodology](../evaluation/README.md), [report](../evaluation/results/local-stratified-v1/report.md) and
[raw records](../evaluation/results/local-stratified-v1/records.jsonl) are public for independent review.

## When to use a prompt optimizer

Cowork is most useful when the initial request is directionally correct but operationally incomplete:

- feature requests missing edge cases and acceptance criteria;
- bug reports without an explicit reproduction and verification plan;
- refactors that must preserve behavior and boundaries;
- architecture tasks that need constraints and trade-offs;
- operations changes that require rollback and failure handling.

It is not a substitute for product decisions, security review, human judgment or downstream test
execution. Its role is to compile intent into a stronger interface between a developer and an executing
AI.

## Start without a model

The deterministic mock path exercises the same application boundary without credentials, a GPU or a model
download:

```bash
./setup.sh
bun run preflight
bun run demo:mock
```

Windows PowerShell:

```powershell
.\setup.ps1
bun run preflight
bun run demo:mock
```

The optimized prompt is printed and saved to `demo-output/prompt.md`. Continue with the
[environment guide](environment.md) for local or OpenAI-compatible inference.
