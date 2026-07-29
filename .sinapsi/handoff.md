# Handoff

## Current state

Repository identity is `PatrickDev-it/ai-prompt-optimizer`; product-facing copy consistently uses
**AI Prompt Optimizer**. The active branch is `docs/record-dependency-sweep`; `main` carries the
merged Dependabot sweep and its CI is green.

README, product guide, remote-workstation guide, architecture entry point, server startup message and
CLI description use the new public name. The product page lives in the companion portfolio repository
at `/projects/ai-prompt-optimizer/`; README links use that canonical path.

No pull request is open.

## Dependency baseline

- `client`: `chalk` 6.0.0 at the top level; `chalk` 5.6.2 stays nested under `ora` and `log-symbols`,
  which declare `^5.3.0`. Only `red`/`green`/`gray`/`cyan`/`dim` are used, so v6 needed no code change.
- `server/modules/requirements-dev.txt`: `ruff==0.16.0`, `hypothesis==6.161.8`, `pytest==9.0.3`,
  `pip-audit==2.9.0`.
- `server/modules/requirements-dev.lock`: **still `ruff==0.12.10` and `hypothesis==6.156.6`** — see
  the trap below before trusting a green gate.

## Trap: the `.txt` pins do not reach CI

`install:frozen` runs `pip install --require-hashes -r server/modules/requirements-dev.lock`. The
`.lock` is the effective pin set; the `.txt` is only pip-compile input. Dependabot edits the `.txt`
and cannot regenerate a hash-locked file, so a merged bump can be **inert**: after #18 and #19 the
gate still ran `ruff 0.12.10`, which is why it was green.

Running the pinned `ruff 0.16.0` by hand exposes **12 findings the gate cannot see**:

| Rule | Count | Where |
|---|---|---|
| `B023` | 2 | `evaluation/metrics.py:142` — closure does not bind the `metric_rows` loop variable |
| `ISC004` | 3 | `evaluation/benchmark.py` — unparenthesized implicit concat inside a collection |
| `RUF100` | 3 | `evaluation/benchmark.py` — `noqa: E402` for a rule that is not enabled |
| `I001` | 2 | `evaluation/benchmark.py`, `evaluation/tests/test_benchmark.py` |
| `FURB167` | 1 | `evaluation/metrics.py:14` — `re.I` alias |
| `BLE001` | 1 | `evaluation/benchmark.py:222` — blind `except Exception` |

`B023` is the only one that is not stylistic: it is a latent bug. Fix it first.

## Regenerating the lock

```powershell
python -m piptools compile --generate-hashes `
  --output-file server/modules/requirements-dev.lock `
  server/modules/requirements-dev.txt server/modules/requirements.txt
```

Match the flags in the lock's own header. Expect the 12 findings above to turn the gate red the first
time the lock actually carries `ruff 0.16.0` — that is the point of regenerating it.

## Compatibility boundary

- `dev-prompt-enhancer` and `prompt-enhancer` remain stable tool names.
- `COWORK_*` configuration and `cowork-eval/v1` remain v1 compatibility/evidence identifiers.
- No runtime provider, protocol, filesystem or output contract changed.

## Verification required

- Run `bun run check`, `bun run docs:check`, `bun run security:scan` and `git diff --check`.
- Publish through CI plus TypeScript and Python CodeQL before merge; `enforce_admins` is on for
  `main`, so a red or missing required check cannot be bypassed — not even with admin rights.
- When probing Python lint locally, invoke the **pinned** ruff (`uvx ruff@0.16.0`): the `ruff` on
  `PATH` here is 0.12.10 and will report clean.

## Invariants

- Keep claims aligned to the two-tool capability split and explicit file-selection boundary.
- Preserve remote exposure safeguards, deterministic fallback and historical field-loop behavior.
- Never commit models, runtime binaries, environments, credentials or user I/O.
- Finish future patches with session, handoff, then summary updates.
