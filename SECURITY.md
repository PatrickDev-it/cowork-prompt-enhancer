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

The server binds loopback by default. Non-loopback operation fails unless explicit remote opt-in and a
minimum 32-character session secret are configured. Remote upgrades use short-lived, single-use HMAC
challenges with constant-time verification. This authenticates the session but does not replace TLS;
terminate TLS before exposing traffic beyond a trusted network.

Frames and decoded payloads, active/queued work, reconnect attempts and command deadlines are bounded.
File operations are capability-limited and confined through canonical path checks beneath the session
root. Provider credentials must be supplied only through environment variables and are redacted from
logs and errors.

Request metrics are disabled by default. When explicitly enabled they expose only bounded, sanitized
traces on loopback; configuration fails if metrics and non-loopback binding are combined.
