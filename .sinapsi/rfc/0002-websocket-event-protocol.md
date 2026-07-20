# RFC 0002 — WebSocket Event Protocol

> Status: **Accepted (reconstructed)** — original decision undated; this document reconstructed
> 2026-07-20 from code and comment history per RFC-0025 § 2.2.
> Mined from: `server/lib/ws.ts`, `client/lib/ws.ts`.
> Author: reconstructed by Claude from source, as directed by RFC-0025 (this is not a
> contemporaneous record — see RFC-0025 Decision § 5).

## Context

The client (a Bun CLI) and the server (a Bun process that also supervises `llama-server` and runs
tools) need a channel that supports more than one request/response cycle per interaction: a tool
invocation streams progress (`status` events: start/progress/log/done/error), can trigger
filesystem operations back on the client (`fileop`), and the menu itself needs to be re-served
after every tool completes (a server-initiated push, not something the client polls for). A plain
HTTP request/response model does not fit that shape without either long-polling or a second
channel; a persistent, bidirectional connection does.

Every tool added later (RFC-0003) needs to speak this protocol without knowing its wire format —
so whatever is chosen has to expose an API a tool author can use without thinking about frames,
JSON, or the underlying `WebSocket`/`ServerWebSocket` object.

## Proposal

A minimal EventEmitter-style API over a single WebSocket connection, implemented symmetrically on
both ends (`client/lib/ws.ts`'s `$WS` and `server/lib/ws.ts`'s `$WSServer` mirror the same
`on`/`off`/`emit`/`send`/`close` surface):

- **Frame shape**: `{ event: string, props: unknown[] }`, JSON-encoded. `emit(event, ...args)`
  wraps `args` as `props` and sends it; the receiving side parses the frame and dispatches to every
  listener registered for `event` via `on`.
- **Untrusted-input boundary**: every inbound frame comes off the network. `handleMessage` treats
  it as hostile: a `JSON.parse` failure or a frame that doesn't match `{event: string, props:
  array}` is logged and dropped, never thrown. On the server this matters structurally, not just
  defensively — an exception escaping Bun's `message` callback would crash the whole `Bun.serve`
  process for every connected client, not just the one that sent the bad frame.
- **One instance per connection**: the server wraps Bun's three native `websocket` lifecycle
  callbacks (`open`/`message`/`close`) via `$WSWrapper`, which keys a `WeakMap<ServerWebSocket,
  $WSServer>` registry so each underlying connection gets exactly one `$WSServer`, constructed on
  `open` and looked up (never re-created) on every subsequent `message`.
- **Session identity**: each connection gets a `uuid` (`randomUUIDv7`) attached at WebSocket
  upgrade time (`SocketData.uuid` in `server/index.ts`), exposed as `$WSServer.sessionId`. Tool
  invocations, `status` events, and `fileop` requests all carry this uuid so responses can be
  correlated back to the session that triggered them.
- **Binary frames reserved, not implemented**: both sides special-case `ArrayBuffer` payloads in
  `handleMessage` and no-op on them today (file transfer is out of scope for this RFC — see
  Consequences). `send()` already branches on `ArrayBuffer`/`Uint8Array` vs. JSON so the wire format
  doesn't need to change when that lands.

## Alternatives

*(Reconstructed: the codebase doesn't record a rejected alternative explicitly. These are the
alternatives the chosen shape structurally rules out, offered as the most plausible read of why
this design and not another — not a claim that a documented bake-off happened.)*

- **HTTP request/response, polling for status.** Rejected by the shape of the requirement itself:
  `status` and the post-tool menu re-serve are server-initiated pushes, and polling would add
  latency and complexity (a second endpoint, a poll interval to tune) for no benefit over a
  connection that's already open for the duration of a CLI session.
- **A general-purpose RPC framework (tRPC, JSON-RPC, gRPC).** Would bring schema/codegen machinery
  disproportionate to a two-package, same-repo client/server pair where both ends are TypeScript
  and can share types directly. The hand-rolled protocol is small enough that both implementations
  fit in under 90 lines each and stay symmetric by inspection.

## Decision

Adopt the EventEmitter-over-WebSocket protocol as implemented: JSON `{event, props}` frames,
symmetric `$WS`/`$WSServer` wrappers, one instance per connection, session identity via uuid,
binary frames reserved for later.

## Consequences

**Positive:** tool authors (RFC-0003) never touch the wire format — a tool just calls
`WS.on(tool.name, handler)` and `status(...)`/`ctx.fs.*` under the hood. The symmetric client/server
implementation means the same mental model applies on both ends, which matters at this project's
scale (one maintainer, two packages).

**Costs / trade-offs:** no schema validation beyond the outer `{event, props}` shape — a listener
that receives a malformed `props` array for its specific event will fail inside its own handler,
not at the protocol layer. File content today travels as UTF-8 JSON string payloads inside
`fileop` requests (RFC-0008), not as binary frames; that's adequate at current file sizes but the
reserved-but-unused binary path would need to be implemented before large binary files could be
transferred efficiently.
