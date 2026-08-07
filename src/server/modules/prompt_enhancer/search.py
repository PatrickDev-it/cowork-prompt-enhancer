"""Optional web grounding and deep research (RFC-0020, RFC-0022).

The deterministic three-mode gate preserves offline operation by default. Boundary failures are reported
to stderr and degrade to empty grounding rather than crashing a request. The search dependency is imported
lazily so the compiler remains testable without network packages."""

import json
import os
import re
import sys

# Conservative freshness signals used only in automatic search mode.
_FRESHNESS_SIGNAL = re.compile(
    r"\b("
    r"latest|newest|current(?:ly)?|recent(?:ly)?|up[- ]?to[- ]?date|nowadays|"
    r"ultim[ao]|recent[ei]|attual[ei]|aggiornat[ao]|"
    r"chang(?:e)?log|release[sd]?|deprecat(?:ed|ion)?|new in|breaking change|"
    r"version|versione|v\d+(?:\.\d+)+|"
    r"202[4-9]|203\d"
    r")\b",
    re.IGNORECASE,
)


def search_mode() -> str:
    return os.getenv("COWORK_PROMPT_ENHANCER_SEARCH", "auto").strip().lower()


def should_search(user_input: str, request_flag: bool | None = None) -> bool:
    """Deterministic search gate: global off/on wins; auto uses an explicit request flag or freshness."""
    mode = search_mode()
    if mode == "off":
        return False
    if mode == "on":
        return True
    # In auto mode an explicit request choice wins; None enables the freshness heuristic.
    if request_flag is not None:
        return bool(request_flag)
    return bool(_FRESHNESS_SIGNAL.search(user_input or ""))


def build_query(user_input: str) -> str:
    # A normalized, bounded request is a conservative metasearch query.
    query = " ".join((user_input or "").split())
    return query[:256]


def web_search(query: str, max_results: int = 5, timeout: int = 8) -> list:
    """Run a lazy DDGS lookup; failures return an empty result after a stderr diagnostic."""
    if not query:
        return []
    try:
        from ddgs import DDGS
    except Exception as exc:  # noqa: BLE001 - optional package boundary degrades without crashing.
        print(
            f"[prompt-enhancer] search provider unavailable ({exc}); continuing without grounding.",
            file=sys.stderr,
            flush=True,
        )
        return []
    try:
        with DDGS(timeout=timeout) as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:  # noqa: BLE001 - network boundary degrades without crashing.
        print(
            f"[prompt-enhancer] web search failed ({exc}); continuing without grounding.", file=sys.stderr, flush=True
        )
        return []


def format_grounding(results: list) -> str:
    lines = []
    for item in results:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()
        href = str(item.get("href") or item.get("url") or "").strip()
        if not (title or body):
            continue
        snippet = " ".join(body.split())[:300]
        entry = f"- {title}: {snippet}".rstrip(": ").strip()
        if href:
            entry = f"{entry} ({href})"
        lines.append(entry)
    return "\n".join(lines)


def gather_grounding(user_input: str, request_flag: bool | None = None, max_results: int = 5) -> str:
    """Return formatted evidence or an empty string when search is disabled or unavailable."""
    if not should_search(user_input, request_flag):
        return ""
    return format_grounding(web_search(build_query(user_input), max_results=max_results))


# --- Deep research (RFC-0022) --------------------------------------------------------------------
# Opt-in multi-query research deliberately performs multiple calls and degrades to an empty report.

_SUBQUERIES_PROMPT = """You are a research planner. From the request below, produce a JSON array of 3 to 5
focused web-search queries that together cover what must be researched to answer it well.
Return ONLY a JSON array of strings, nothing else.

REQUEST:
{user_input}
"""

_SYNTHESIS_PROMPT = """You are a research analyst. Using ONLY the web results below, write a concise, well
-structured research report in English that addresses the request. State concrete facts, and note uncertainty
where sources are thin or conflict. Do NOT invent facts unsupported by the results. Output Markdown with short
sections. No preamble, no meta commentary.

REQUEST:
{user_input}

WEB RESULTS:
{results}
"""


def _plan_subqueries(engine, user_input: str, think: bool = False) -> list:
    raw = engine.generate(
        _SUBQUERIES_PROMPT.format(user_input=(user_input or "")[:2000]), max_new_tokens=256, think=think
    )
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(q).strip() for q in parsed if str(q).strip()][:5]


def run_deep_research(engine, user_input: str, per_query_results: int = 5, think: bool = False) -> str:
    """Return a synthesized report; global search-off remains the egress kill switch."""
    if search_mode() == "off":
        return ""

    try:
        queries = _plan_subqueries(engine, user_input, think=think)
    except Exception as exc:  # noqa: BLE001 - planning failure falls back to the request query.
        print(f"[prompt-enhancer] deep research query planning failed ({exc}).", file=sys.stderr, flush=True)
        queries = []
    if not queries:
        queries = [build_query(user_input)]

    aggregated, seen = [], set()
    for query in queries:
        for item in web_search(query, max_results=per_query_results):
            if not isinstance(item, dict):
                continue
            key = str(item.get("href") or item.get("url") or item.get("title") or "").strip()
            if key and key not in seen:
                seen.add(key)
                aggregated.append(item)

    if not aggregated:
        print(
            "[prompt-enhancer] deep research collected no web sources; returning no report.",
            file=sys.stderr,
            flush=True,
        )
        return ""

    results_text = format_grounding(aggregated)
    synth_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_RESEARCH_TOKENS", "1536"))
    try:
        report = engine.generate(
            _SYNTHESIS_PROMPT.format(user_input=(user_input or "")[:2000], results=results_text),
            max_new_tokens=synth_tokens,
            think=think,
        )
    except Exception as exc:  # noqa: BLE001 - synthesis failure returns no report without crashing.
        print(f"[prompt-enhancer] deep research synthesis failed ({exc}).", file=sys.stderr, flush=True)
        return ""
    return (report or "").strip()
