# Contributing

## Development contract

Use Bun 1.3.12, Node 22.13.0, and Python 3.12.4. Install from the checked-in locks:

```bash
bun run install:frozen
```

Before opening a pull request, run:

```bash
bun run check
bun run audit
bun run docs:check
bun run security:scan
```

Changes must retain strict TypeScript, Ruff and Biome enforcement. Every defect fix requires a
regression test; public behavior requires contract or integration coverage. Do not commit credentials,
`.env` files, generated input/output, virtual environments, models, executables, or CUDA libraries.

Use Conventional Commits and keep each commit mapped to the relevant root `RFC.md` problem IDs. Propose
an RFC under `.sinapsi/rfc/` before changing a public protocol, provider contract, authentication scheme,
configuration schema, storage format, or invariant not already decided.

See [`docs/DEV.md`](docs/DEV.md) for commands and [`SECURITY.md`](SECURITY.md) for vulnerability reports.
