# Sinapsi — operating instructions

Short on purpose. This file says how to work *here*; it does not repeat your project's
stack, style or test conventions — those live in your own AGENTS.md, untouched.

## Memory: read one file first, write three last

Before you think, plan or open a source file, read **one** file:

- `.sinapsi/summary.md` — the directory tree, the last 10 sessions, and a short recap

That is the cardinal rule. `session.md` and `handoff.md` are the sources `summary.md` is
built from; open them only when the summary leaves your actual question unanswered.

At the end of every patch, in this order:

1. **append** `.sinapsi/session.md` — the full entry for this patch
2. **rewrite** `.sinapsi/handoff.md` — current working state, **≤ 150 lines**
3. **update** `.sinapsi/summary.md` from both — add one dated line under *Recent
   sessions* (keep the last 10), rewrite *Where things stand* in 5–10 lines, and leave
   the tree block at the top alone: Sinapsi maintains it itself, live, and any edit you
   make inside its markers is thrown away on the next change

A patch that leaves any of the three stale is not finished.

`session.md` archives itself: past 150 lines (or its token budget) Sinapsi moves it to
`.sinapsi/archive/` and starts a fresh one, whose header names the latest archive. Read
that one if you must — never the whole folder. `sinapsi compact` forces the same check.

## Exploring

Start with Sinapsi MCP rather than a filesystem sweep — it is the cheaper first move,
not a prohibition. Pick the tool by what you already know:

- behaviour only → `query_graph`
- exact symbol, need its location → `get_node`
- exact symbol, need callers/impact → `get_neighbors`
- no idea of the shape → `graph_stats` (once)

The graph (`.sinapsi/graph.json`) is a derived index, not the truth: it is built from the
source, it lags edits, and it drops what its extractors cannot see. The filesystem is
the authority. Reach for `grep`/`rg` whenever you want to confirm what the graph told
you — verifying a result is never a failure, and each header below says what it does
*not* cover.

## Reading the headers

Four independent claims. None implies another.

- `RELEVANCE` — how much of your question the top result explains. `RELEVANCE: weak`
  means the answering symbol may be absent entirely: re-query in the project's
  vocabulary, then search the filesystem.
- `COVERAGE` — the token budget only. It says nothing about symbols the ranker never
  nominated, so `complete` is not a claim that the answer is present.
- `STRUCTURE` — `absent` means relationships are unknown, never "no callers".
- `FRESHNESS` — how stale the index may be.

## Decisions

`.sinapsi/rfc/` before a boundary moves: public API, schema, storage format, an
invariant, a dependency. An RFC states the problem, the measured evidence, the
alternatives rejected, and the test that would prove it wrong. Propose one when the
boundary moves — do not wait to be asked.

`.sinapsi/adr/` after it is decided. An ADR is immutable: supersede it, never edit it.

Small choices get no RFC — one line in `decisions.md` is the whole ceremony.
