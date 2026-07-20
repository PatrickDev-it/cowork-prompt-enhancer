# RFC 0008 — Client-Declared File-Operation Capability Negotiation

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/tools/fs.ts`, `client/events/fileop.ts`, `server/tools/types.ts`.
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).

## Context

Tools running on the server (RFC-0003) need to write files back to the user's machine — the
prompt-enhancer delivers its output as a markdown file in the session folder, for instance
(RFC-0018). The server has no direct filesystem access to the client's machine; it can only ask,
over the WebSocket protocol (RFC-0002), for the client to perform an operation on its behalf.

Two designs are possible for "the server asks the client to touch a file": trust every request the
server sends, or require the client to say up front what it's willing to execute and have the
server enforce that boundary itself. The second is the one implemented — the server is the one
issuing filesystem-mutating commands to code running on someone else's machine, so it is also the
side responsible for never sending an operation the client didn't agree to support.

## Proposal

- **Client declares, server enforces.** `client/events/fileop.ts` exports `SUPPORTED_OPS` — the
  literal set of operation names its `handlers` map implements (`write`, `append`, `mkdir`,
  `delete`, `move`). The client sends this set to the server as part of session/connection setup.
  `server/tools/fs.ts`'s `rememberAdvertisedOps(WS, ops)` stores it in a `WeakMap<$WSServer,
  Set<FileOp>>` keyed by connection, filtering out anything not in the server's own `KNOWN` list
  (unrecognized strings off the wire are discarded, not trusted).
- **Every outbound fileop is checked against the advertised set, not assumed.** `createFileOps(WS)`
  builds the `ctx.fs` object a tool's `run()` receives (`write`/`append`/`mkdir`/`delete`/`move`).
  Its internal `send()` checks `advertised.get(WS)?.has(req.op)` before emitting anything; an
  operation outside that set throws immediately, loudly, inside the tool's own error path (surfaced
  to the user as `status: error` via `tools/runtime.ts`) rather than being sent and silently
  ignored or failing deep inside client-side code the server can't see.
- **The client is the one that confines paths, not the server.** Every path the server sends is
  relative to the session folder; `client/events/fileop.ts`'s `confine(base, rel)` resolves it
  against that base and rejects anything absolute, empty, or that escapes via `..` — returning
  `null` rather than throwing, so a malformed path is logged and dropped locally instead of
  crashing the client's event loop. The server never receives confirmation of *how* a path was
  resolved; it only receives success/failure as a console-visible log line on the client, by
  design (see Non-goals below and RFC-0002's error-boundary discussion).
- **Non-goals:** this is not an authentication or authorization system between untrusted parties —
  client and server are two halves of one local tool run by one operator. It exists to make an
  *unannounced* operation a hard, visible failure instead of a silent one, and to keep path
  confinement enforcement on the side that actually owns the filesystem being touched.

## Alternatives

*(Reconstructed: no rejected alternative is recorded in the source. The following are the
plausible alternatives this design's shape rules out.)*

- **Server assumes the client supports every operation it might ever need.** Rejected implicitly:
  it would mean a client running an older build (missing a newer op like `move`) fails inside its
  own generic fileop dispatcher with an "unknown fileop" message that gives the tool author no
  chance to react — versus today's design, where the *tool* gets a catchable error it can turn into
  a meaningful `status: error` for the user.
- **Negotiate capabilities per-tool instead of per-connection.** Would add a second layer of
  negotiation (which tool wants which op, does the client support it for this specific call) for no
  observed benefit — the client's file-operation surface doesn't vary by which tool is asking.

## Decision

Adopt client-declared, server-enforced file-operation capability negotiation: the client advertises
`SUPPORTED_OPS` once per connection, the server rejects (loudly, per-tool) any operation outside
that set before it is ever sent, and the client — not the server — owns path confinement to the
session folder.

## Consequences

**Positive:** a tool author writing `ctx.fs.write(...)` gets a clear, catchable error if that
capability isn't available for the current connection, instead of the request vanishing into a
client that doesn't know what to do with it. Path-traversal protection lives with the code that
actually has filesystem access, which is the right place for it to live.

**Costs / trade-offs:** capability negotiation happens once per connection and is not
re-negotiated mid-session — a client that changes its supported-ops set without reconnecting would
have a stale `advertised` entry server-side. That has not been a practical problem because the
client's `SUPPORTED_OPS` is a static, build-time constant, not something that changes at runtime.
