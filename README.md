# Cowork AI Prompt Optimizer for Developers

[![CI](https://github.com/PatrickDev-it/cowork-prompt-enhancer/actions/workflows/ci.yml/badge.svg)](https://github.com/PatrickDev-it/cowork-prompt-enhancer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/PatrickDev-it/cowork-prompt-enhancer/actions/workflows/codeql.yml/badge.svg)](https://github.com/PatrickDev-it/cowork-prompt-enhancer/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/PatrickDev-it/cowork-prompt-enhancer)](https://github.com/PatrickDev-it/cowork-prompt-enhancer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Write it rough. Cowork compiles the rest.**

Cowork is an open-source AI prompt optimizer that turns incomplete developer requests into
implementation-ready prompts for ChatGPT, Gemini, Claude Code, Codex and other AI coding agents. Write the
task quickly—even badly—and the intent-to-specification compiler preserves requirements, exposes
assumptions, adds acceptance criteria and produces a portable prompt you can inspect before execution.

The optimizer can run offline with a deterministic mock, on a private GPU workstation through supervised
local inference, or against an operator-selected OpenAI-compatible endpoint. The generated prompt is plain
text: no downstream vendor lock-in and no mandatory cloud account.

[See the product page](https://patrickdev-it.github.io/projects/prompt-enhancer/) ·
[Read the AI prompt optimizer guide](docs/ai-prompt-optimizer-guide.md) ·
[Download v1.0.0](https://github.com/PatrickDev-it/cowork-prompt-enhancer/releases/tag/v1.0.0)

## From rough request to executable specification

Input:

```text
add login and make it secure, use the db we already have
```

Cowork compiles the request into a structured specification with:

- the intended outcome and explicit constraints;
- bounded assumptions and questions instead of invented certainty;
- implementation steps, security requirements and failure behavior;
- verifiable acceptance criteria and a completion checklist.

It treats prompt optimization as a reliability problem: explicit requirements must survive, invented
specificity must remain bounded, malformed model output must have a deterministic delivery path, and the
runtime must fail safely.

## Where Cowork fits

| Need | Cowork path |
|---|---|
| Optimize prompts without credentials or a model download | Deterministic `mock` profile |
| Keep task content and inference on your own machine | Supervised `local` profile |
| Use a powerful workstation from a lighter development machine | Authenticated remote exposure to the operator-managed Cowork server |
| Use an existing gateway or hosted model | Explicit `openai-compatible` profile |
| Send the result to ChatGPT, Gemini, Claude Code, Codex or another agent | Copy the vendor-neutral compiled prompt |

Cowork is an independent open-source project. It is not affiliated with, endorsed by or an official
optimizer for OpenAI, Google, Anthropic or their products.

## Measured result

On the published eight-case stratified local reference using Qwen3-8B Q4_K_M, the compiler increased
deterministic structural validity from **0.333 to 0.792** and the executability rubric from **0.725 to
0.975** versus the raw request. Explicit-requirement precision remained **1.000**; recall changed from
**1.000 to 0.917**. Compiler latency was 8.67 s p50 and 11.97 s p95 on an RTX 3070 Ti.

This is a transparent lexical evaluation on eight cases, not human judgment or a general superiority
claim. The [report](evaluation/results/local-stratified-v1/report.md),
[raw records](evaluation/results/local-stratified-v1/records.jsonl) and
[environment](evaluation/results/local-stratified-v1/environment.json) are published together.

## Three-minute quickstart

Prerequisites: Bun 1.3.12 and Python 3.12.4. The setup command installs frozen dependencies; inference is
then deterministic, offline, credential-free and independent of a GPU or model download.

macOS/Linux:

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

The optimized prompt is printed and written to `demo-output/prompt.md`. Deterministic failure injection is
available through `COWORK_MOCK_SCENARIO=malformed|context_overflow|timeout|provider_failure`. Run
`bun run demo:record` for the sanitized success, fallback, artifact and 64-case benchmark transcript.

## Provider paths

| Profile | Purpose | Activation |
|---|---|---|
| `mock` | CI, evaluation and reviewer path | Default; no configuration |
| `local` | Private Windows/Ubuntu inference through a supervised llama-server | `./setup.sh --local` or `.\setup.ps1 -Local` |
| `openai-compatible` | Operator-selected compatible endpoint | Explicit base URL, model and environment credential |

All profiles implement one typed provider contract and error taxonomy. Local binaries, models and CUDA
libraries are checksummed but never committed or redistributed. See the
[environment reference](docs/environment.md) and [artifact provenance](THIRD_PARTY.md).

## Architecture

```mermaid
flowchart LR
    Client["Bun client\nconnection state machine"] <== "WebSocket v1" ==> Server["Schema + auth boundary\nbounded scheduler"]
    Server --> Tools["Capability-aware tools\ncontext compression"]
    Tools --> Worker["Python compiler\ncorrelation trace"]
    Worker --> Provider["mock | local | openai-compatible"]
    Provider --> Fallback["compiler or single pass → field loop"]
    Tools --> Artifact["confined session artifact"]
```

The historical field-loop remains the terminal fallback. The local profile alone owns a supervised
llama-server process with health polling, capped exponential restart and clean signal shutdown. The
[architecture and threat model](docs/architecture.md) documents lifecycle, limits and residual risk.

## Run the model where the compute is

Cowork separates the client from the inference server. A developer can keep the client on a laptop while
the local model runs on a more powerful Windows or Ubuntu workstation under their control. Loopback is the
safe default; non-loopback access requires explicit opt-in and short-lived HMAC authentication. The
operator remains responsible for private networking and TLS termination.

## Security model

- Loopback binding is the zero-configuration default.
- Non-loopback use requires explicit opt-in and a short-lived, single-use HMAC challenge; TLS termination
  remains the operator's responsibility.
- Protocol schemas, frames, payloads, queues, per-session concurrency, deadlines and reconnect attempts are
  bounded before tool execution.
- File operations require advertised capabilities and canonical confinement beneath the session root.
- Correlated traces exclude prompts and credentials; the bounded `/metrics` endpoint is opt-in and
  loopback-only.
- CI audits dependencies, scans tracked content, runs CodeQL and validates a model-free checksummed release.

Report vulnerabilities through the private channel described in [SECURITY.md](SECURITY.md).

## Evaluation and verification

`cowork-eval/v1` contains 64 non-sensitive tasks balanced across implementation, debugging, refactoring,
architecture, operations, data/ML, research and professional writing. It compares raw, thin, compiler and
field-loop strategies and separates compiler success from fallback-delivered success.

| Evidence tier | Cases / records | Role |
|---|---:|---|
| Deterministic mock | 64 / 264 | Complete reproducible harness and strategy coverage |
| Stratified local | 8 / 32 | Real-model comparison across all eight categories |

No human result is claimed. A blinded review exchange is implemented for future external ratings. Run
`bun run benchmark` for the full mock tier or inspect the [methodology and limitations](evaluation/README.md).

The complete local/release gate is:

```bash
bun run gate:release
```

It covers formatting, lint, strict typechecking, unit/integration/E2E tests, dependency audits,
documentation links, secret/heavyweight-artifact scanning, demo recording, SBOM generation and checksums.

## Limitations

- Local benchmark evidence is eight cases on one Windows/NVIDIA workstation; latency is not portable.
- Lexical metrics do not measure semantic paraphrase quality or downstream task completion.
- Loopback is a same-user trust boundary, not an operating-system sandbox.
- Remote providers receive request content and retain it under their own operator-selected policy.
- Optional web grounding performs outbound retrieval; reference benchmarks use timestamped fixtures only.

## AI prompt optimizer FAQ

### What is an AI prompt optimizer?

It converts a rough request into a clearer, more testable prompt before another AI executes it. Cowork
focuses on developer tasks and compiles intent into requirements, constraints, assumptions, steps and
acceptance criteria.

### Does Cowork work with ChatGPT, Gemini, Claude Code and Codex?

Yes as an output workflow: Cowork produces portable text that can be pasted into those tools and other AI
coding agents. Its inference providers are mock, local and OpenAI-compatible; it does not claim native
plugins or official vendor integrations.

### Is Cowork an OpenAI prompt optimizer?

Cowork can use an operator-configured OpenAI-compatible endpoint and can optimize prompts intended for
OpenAI tools, but it is an independent project and not an official OpenAI product.

### Can prompt optimization run locally or on a remote GPU machine?

Yes. The local profile supervises a private llama-server, while the authenticated protocol allows an
operator to expose Cowork from a more powerful machine. Remote deployment requires deliberate network and
TLS configuration.

### Is it free?

The source code is MIT licensed. Hosted-model, network and hardware costs depend on the provider and
infrastructure selected by the operator.

## Engineering record

Deep implementation guidance lives in [docs/DEV.md](docs/DEV.md). The decisions needed to understand the
product boundary are the [compiler](.sinapsi/rfc/0018-intent-to-specification-compiler.md),
[provider profiles](.sinapsi/rfc/0026-provider-profiles-and-configuration.md),
[protocol/security model](.sinapsi/rfc/0027-authenticated-versioned-protocol-and-resource-bounds.md) and
[evaluation evidence](.sinapsi/rfc/0028-versioned-evaluation-evidence.md). Reconstructed decisions retain
their original reconstructed label.

[MIT](LICENSE) licensed. See [support](SUPPORT.md), [contributing](CONTRIBUTING.md),
[changelog](CHANGELOG.md) and [release policy](docs/release-policy.md).
