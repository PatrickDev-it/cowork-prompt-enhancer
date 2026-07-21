# Security policy

## Supported versions

Security fixes are provided for the latest stable release. Development branches are not supported
deployment targets.

## Reporting a vulnerability

Use the repository's private GitHub vulnerability-reporting channel. Do not open a public issue for a
suspected vulnerability and do not include credentials, local environment files, model data, or user
artifacts in a report.

Include the affected version, reproducible steps, impact, and any proposed mitigation. The maintainer
will acknowledge a valid report within five business days and coordinate disclosure after a fix is
available.

## Security boundary

The default profile binds to loopback. Non-loopback operation is unsupported unless authentication is
explicitly configured. File operations are capability-limited and confined to the resolved session root;
provider credentials must be supplied only through environment variables and are redacted from logs.
