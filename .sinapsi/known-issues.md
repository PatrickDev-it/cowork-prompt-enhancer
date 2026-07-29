# Known issues & pitfalls

Operational memory: what bit us, so it never bites twice.
Format per entry: `symptom → root cause → fix / how to avoid`. Consult before debugging.

---

### A merged dependency bump has no effect and CI stays green anyway
**Symptom.** `server/modules/requirements-dev.txt` asks for `ruff==0.16.0`, the hosted `verify` job is
green, and yet running ruff locally at the pinned version reports 12 findings. The installed version
is still 0.12.10.
**Root cause.** `install:frozen` installs `requirements-dev.lock` with `--require-hashes`. The `.lock`
is the effective pin set; the `.txt` is only pip-compile input. Dependabot edits the `.txt` and cannot
regenerate a hash-locked file, so the two drift apart and the gate keeps running the old version.
**Fix / how to avoid.** Treat a green gate after a Python bump as unproven until `.lock` shows the new
version. Regenerate with `pip-compile --generate-hashes` using the flags in the lock's own header, and
expect the gate to go red the first time the new linter actually runs. Same trap in the other
direction: the `ruff` on `PATH` in this workspace is 0.12.10, so a local `bun run lint` also reports
clean — probe with `uvx ruff@<pinned version>` when you need the truth.

---

### `bun install --frozen-lockfile` fails on a Dependabot branch that changed only a `package.json`
**Symptom.** A Dependabot PR touching a single dependency in `client/package.json` fails at the very
first CI step with `lockfile had changes, but lockfile is frozen`.
**Root cause.** Dependabot updates the manifest but does not regenerate the root workspace `bun.lock`,
so the frozen install refuses the mismatch. Nothing about the bumped package is wrong.
**Fix / how to avoid.** Run `bun install` at the workspace root on the bot's branch and commit the
resulting `bun.lock`. Check the diff is minimal: a major bump that peers still pin to the old range
should show the new version at top level and the old one nested (this is what `chalk` 6 with `ora` and
`log-symbols` on `^5.3.0` looks like).
