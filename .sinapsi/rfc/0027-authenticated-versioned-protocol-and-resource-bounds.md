# RFC 0027 — Authenticated versioned protocol and resource bounds

> Status: **Accepted** — 2026-07-22
> Scope: root RFC P-04–P-07, P-11–P-13 and security/integration portions of P-15
> Amends: RFC-0002, RFC-0008 and RFC-0014

## Problem

The unversioned `{event, props}` WebSocket shape has no event-level schema, payload bound,
authentication or replay control. The server implicitly binds without a declared trust boundary; tool
work is unbounded; reconnects can repeat mutations; path checks are lexical only; and the global
llama-server supervisor cannot be failure-tested deterministically.

## Decision

The server binds `127.0.0.1` by default. Any non-loopback host requires both
`COWORK_ALLOW_REMOTE=true` and a minimum 32-byte `COWORK_AUTH_SECRET`, validated before supervisors or
workers start. Remote clients obtain a single-use, 30-second challenge and authenticate the WebSocket
upgrade with an HMAC-SHA-256 proof over the challenge identity, nonce, expiry and stable client ID.
Verification uses equal-length constant-time comparison; challenges are consumed once and never logged.

The only accepted application frame is protocol v1, a discriminated JSON envelope:

- command: `{version:1, kind:"command", id, event, payload}`;
- cancellation: `{version:1, kind:"cancel", id}`;
- server event: `{version:1, kind:"event", id, event, payload}`;
- stable error: `{version:1, kind:"error", id, code, message, retryable}`.

The shared TypeScript schema validates every envelope and event payload before dispatch. Frames are
limited to 1 MiB and decoded JSON payloads to 512 KiB. Binary frames are unsupported. Stable public
codes cover invalid frames, authentication, authorization/capability, overload, timeout, cancellation,
path rejection, provider and internal failures. Logs contain structured client/session/correlation IDs,
never credentials or proofs.

A bounded scheduler admits at most four active commands globally, two per client session and 32 queued
commands. Queue overflow fails fast. Each command has an `AbortSignal`, deadline and stable ID. Cancel or
disconnect terminates owned Python workers, thereby terminating their provider request. Progress events
are backpressure-aware: terminal events are retained, while superseded non-terminal progress for the
same command is coalesced. Recent `(clientId, commandId)` outcomes remain in a bounded TTL cache so a
reconnect cannot execute a mutation twice.

The client uses explicit `connecting`, `ready`, `degraded`, `reconnecting` and `closed` states. It retries
with bounded exponential backoff plus jitter, reuses stable command IDs, and never automatically replays
a command after an acknowledged terminal event.

Filesystem operations resolve beneath a canonical session root and reject empty/absolute/UNC/device
paths, traversal, mixed-separator escapes, Windows reserved names, capability mismatch and symlink or
junction escape. Existing targets and existing ancestors are realpath-checked before mutation.

The llama supervisor becomes an injectable state machine whose spawn, health, clock and signal adapters
can be tested for healthy startup, health timeout, crash, capped exponential restart and clean shutdown.
RFC-0014 lifecycle ownership remains unchanged.

## Compatibility and migration

This is an intentional protocol break: client and server ship together and legacy unversioned frames are
rejected. Tool authors retain the event-oriented wrapper API. `run_enhancement_field_loop` and the Python
workflow contract remain unchanged.

## Alternatives rejected

- Bearer token in every frame: replayable and easy to expose in frame diagnostics.
- Origin checks as authentication: CLI/non-browser clients do not provide a trustworthy origin.
- Unbounded retries or queues: conceal overload and violate deterministic resource limits.
- Lexical-only path prefix checks: do not stop symlink/junction escapes.
- External queues or distributed coordination: unnecessary for a local-first single-process service.

## Falsification

This decision is wrong if anonymous, expired or replayed remote upgrades succeed; malformed or oversized
frames reach handlers; reconnect repeats a command; cancellation leaves its worker/provider alive;
filesystem operations escape the canonical root; concurrency exceeds configured bounds; or any
supervisor failure path leaves an orphan child.
