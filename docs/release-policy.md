# Release policy

Releases follow Semantic Versioning. Stable releases are tagged `vMAJOR.MINOR.PATCH` from a green `main`
branch and contain source, changelog, SBOM/dependency inventory, third-party provenance, benchmark report,
and checksums for every produced asset. Tag pushes rebuild the bundle from the tagged commit; release
publication is a deliberate maintainer action after the validation workflow passes.

The repository remains private until frozen installation, tests, audits, secret scanning, documentation
links, mock quickstart, and release-package validation all pass from a clean checkout. Models, executables,
CUDA libraries, virtual environments, credentials, and generated user I/O are excluded from every release.

Only the latest stable version receives fixes. Breaking protocol, provider, configuration, or artifact
changes require an accepted RFC and a major-version or documented migration decision.
