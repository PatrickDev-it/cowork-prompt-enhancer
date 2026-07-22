# RFC 0026 — Provider profiles and validated configuration

> Status: **Accepted** — 2026-07-22
> Scope: root RFC P-02, P-03, P-16 and P-19
> Supersedes: provider selection assumptions in RFC-0025 Phase 3; preserves RFC-0014 local supervision

## Problem

The existing engine always constructs `LlamaServerProvider` from scattered environment variables. A
reviewer cannot run the product without workstation artifacts, invalid combinations fail late, and the
provider contract does not distinguish timeout, context and transport failures consistently.

## Decision

Expose three named profiles through `COWORK_PROFILE`:

- `mock` is the default for demos and CI. It is deterministic, offline, has no credential, and supports
  explicit `success`, `malformed`, `context_overflow`, `timeout`, and `provider_failure` scenarios.
- `local` selects the supervised llama-server adapter and requires readable executable/model paths before
  workers start. Missing compatible artifacts are an unsupported smoke-test outcome, not a pass.
- `openai-compatible` requires `COWORK_OPENAI_BASE_URL`, `COWORK_OPENAI_MODEL`, and
  `COWORK_OPENAI_API_KEY`; it never assumes a vendor hostname or model.

The provider contract retains `chat`, `health`, and `info`. Implementations raise stable typed
`ProviderTimeoutError`, `ProviderContextError`, `ProviderConfigurationError`, and `ProviderError`.
Credentials are stored only in memory, sent as a bearer header when configured, and redacted from errors,
diagnostics, artifacts and tests.

`COWORK_PROMPT_ENHANCER_PROVIDER` remains a one-release compatibility alias. `llama_server` maps to
`local`; `openai_compatible` maps to `openai-compatible`. A conflicting alias/profile is rejected.

## Validation contract

Configuration is parsed once and validated before supervisors/workers start. Preflight reports OS,
runtime versions, profile, provider capabilities, configured model identity, local checksums, GPU
availability and actionable failures without printing secrets. The same provider conformance suite runs
against mock and deterministic HTTP test doubles for local/remote.

## Alternatives rejected

- Hosted-vendor SDKs: unnecessary coupling and dependencies for an OpenAI-compatible HTTP contract.
- Silent local fallback to mock: hides production misconfiguration and invalidates benchmark identity.
- Committing runtime artifacts: violates repository size, provenance and licensing constraints.

## Falsification

This decision is wrong if a clean offline clone cannot execute the mock E2E, an invalid profile starts a
worker, contract tests differ by provider, or any configured credential appears in captured logs/errors.
