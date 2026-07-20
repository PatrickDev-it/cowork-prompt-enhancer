"""Web-search grounding per il prompt-enhancer — RFC-0020.

Supera il knowledge cutoff del modello con un lookup DuckDuckGo (via `ddgs`: metasearch zero-API-key,
gratuito). Un solo lookup HTTP PRIMA dell'unica chiamata LLM del compiler (RFC-0018): aggiunge una I/O
di rete, non N decode. Il risultato entra nel prompt come EVIDENZA subordinata alle Inference Rules
(RFC-0019), non come requisiti.

Gate a tre modi (`COWORK_PROMPT_ENHANCER_SEARCH`, default `auto`) più un flag per-richiesta, così il
determinismo di default (RFC-0017/0018) è preservato: si cerca solo su segnale di freschezza o quando
forzato. Ogni errore ai confini (import mancante, rete, parsing) è loggato su stderr e degrada a
grounding vuoto — mai un catch silenzioso, mai il crash della richiesta (AGENTS.md § error handling).

`ddgs` è importato LAZY dentro `web_search`, così `workflow.py` resta importabile e testabile con engine
stubbato anche senza il pacchetto installato."""
import json
import os
import re
import sys

# Segnali di "freschezza": la presenza di uno ⇒ la conoscenza ferma al training può essere obsoleta,
# quindi vale un lookup (in modo `auto`). Conservativo di proposito: in dubbio, non cerca (determinismo).
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
    """Decisione deterministica (zero LLM). Il MODE globale ha la precedenza come kill/force switch:
    `off` mai (kill dell'egress), `on` sempre. In `auto` decide il flag per-richiesta se esplicito
    (`True`=on, `False`=off — es. il toggle 'web search' del dev tool, RFC-0021), altrimenti l'euristica
    di freschezza (RFC-0020). `None` ⇒ euristica."""
    mode = search_mode()
    if mode == "off":
        return False
    if mode == "on":
        return True
    # auto: un flag esplicito (True/False) vince sull'euristica; None ⇒ euristica di freschezza.
    if request_flag is not None:
        return bool(request_flag)
    return bool(_FRESHNESS_SIGNAL.search(user_input or ""))


def build_query(user_input: str) -> str:
    # La richiesta stessa (normalizzata e troncata) è già una buona query per un metasearch.
    query = " ".join((user_input or "").split())
    return query[:256]


def web_search(query: str, max_results: int = 5, timeout: int = 8) -> list:
    """Esegue il lookup. Import di `ddgs` lazy; ogni fallimento ⇒ [] + log su stderr (degradazione)."""
    if not query:
        return []
    try:
        from ddgs import DDGS
    except Exception as exc:  # noqa: BLE001 - confine: pacchetto assente ⇒ nessun grounding, non un crash.
        print(f"[prompt-enhancer] ddgs non disponibile ({exc}); nessun grounding.", file=sys.stderr, flush=True)
        return []
    try:
        with DDGS(timeout=timeout) as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:  # noqa: BLE001 - confine di rete: fallimento ⇒ nessun grounding, non un crash.
        print(f"[prompt-enhancer] web search fallita ({exc}); nessun grounding.", file=sys.stderr, flush=True)
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
    """Punto d'ingresso unico usato da `workflow.py`: ritorna il testo dei risultati (o "" se non si
    cerca / nessun risultato / errore). Il wrapping nel blocco di prompt lo fa `compile_intent`."""
    if not should_search(user_input, request_flag):
        return ""
    return format_grounding(web_search(build_query(user_input), max_results=max_results))


# --- Deep research (RFC-0022) --------------------------------------------------------------------
# Passaggio multi-query OPT-IN: genera sotto-query → più lookup DDG → il modello sintetizza un report.
# È multi-chiamata (rompe il single-call di RFC-0018 di proposito): vale solo quando l'utente lo attiva.
# `engine` è duck-typed (ha `.generate`), passato da `workflow.py` — search.py non lo importa (niente
# import circolare). Ogni fallimento degrada a report vuoto + log su stderr, mai un crash.

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
    raw = engine.generate(_SUBQUERIES_PROMPT.format(user_input=(user_input or "")[:2000]), max_new_tokens=256, think=think)
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        parsed = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(q).strip() for q in parsed if str(q).strip()][:5]


def run_deep_research(engine, user_input: str, per_query_results: int = 5, think: bool = False) -> str:
    """Ritorna un report di ricerca sintetizzato (o "" se disabilitato / nessuna fonte / errore).
    `COWORK_PROMPT_ENHANCER_SEARCH=off` resta il kill-switch globale dell'egress: niente ricerca."""
    if search_mode() == "off":
        return ""

    try:
        queries = _plan_subqueries(engine, user_input, think=think)
    except Exception as exc:  # noqa: BLE001 - confine modello: pianificazione fallita ⇒ fallback a una query.
        print(f"[prompt-enhancer] deep-research: pianificazione sotto-query fallita ({exc}).", file=sys.stderr, flush=True)
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
        print("[prompt-enhancer] deep-research: nessuna fonte web raccolta; report vuoto.", file=sys.stderr, flush=True)
        return ""

    results_text = format_grounding(aggregated)
    synth_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_RESEARCH_TOKENS", "1536"))
    try:
        report = engine.generate(
            _SYNTHESIS_PROMPT.format(user_input=(user_input or "")[:2000], results=results_text),
            max_new_tokens=synth_tokens,
            think=think,
        )
    except Exception as exc:  # noqa: BLE001 - confine modello: sintesi fallita ⇒ nessun report, non un crash.
        print(f"[prompt-enhancer] deep-research: sintesi del report fallita ({exc}).", file=sys.stderr, flush=True)
        return ""
    return (report or "").strip()
