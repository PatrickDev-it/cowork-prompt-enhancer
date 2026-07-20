"""Prompt enhancement pipeline. Three spec-generation strategies, all behind `run_enhancement`
(same result-dict shape) — RFC-0005, RFC-0010, RFC-0011, RFC-0017, RFC-0018.

- `compiler` (**default**, RFC-0018) — the module as an **Intent-to-Specification Compiler**
  (RFC-0017): a single call (`compile_intent`) internally runs the pipeline (intent extraction →
  implicit-requirement inference → domain/technical expansion → LLM optimization) and emits JSON
  with sections that *compile* the request instead of *narrating* it (`Task`/`Context`/`Known
  Requirements`/`Inferred Requirements`/…). Output always in English; explicit vs. inferred tracked
  separately. Rendered by `build_specification` (empty sections skipped). On parse failure → `field_loop`.
- `single_pass` (RFC-0011, opt-in) — a single call generates the historical 13-field PromptSpec via
  `FULL_SPEC_PROMPT`, rendered by `build_compiled_prompt`. Selectable fallback via env var.
- `field_loop` (RFC-0005 § crit. 4) — the historical logic, 13 sequential calls (one per field) +
  `critique`. **Must not be altered.** Also the safety net when the other two fail to parse.

Selector: `COWORK_PROMPT_ENHANCER_STRATEGY` ∈ {`compiler`, `single_pass`, `field_loop`}.
Stdlib only here (`engine` is passed in as a duck-typed parameter); the module's only external
dependency is `ddgs`, isolated in `search.py` behind a lazy import (RFC-0020) — this file stays
importable without it."""
import json
import os
import re

from search import gather_grounding, run_deep_research

SINGLE_ENHANCER_PROMPT = """You are an expert Prompt Enhancement Engine.

Goal:
Build one field of a high-quality, execution-ready prompt specification from the user request.
You must maximize practical success rate and avoid generic boilerplate.

MODE:
{mode}

USER REQUEST:
{user_input}

CURRENT CONTEXT JSON:
{current_context_json}

TARGET FIELD:
{target_field}

OUTPUT CONTRACT:
Return valid JSON only in this shape:
{{
  "value": <value>
}}

TYPE RULES:
- If TARGET FIELD is one of execution_steps, constraints, validation_rules, anti_hallucination_rules, system_instructions:
  value must be an array of concise strings.
- If TARGET FIELD is output_format:
  value must be an object with keys type (string) and structure (array of strings).
- For all other fields:
  value must be a concise string.

QUALITY RULES:
- Be specific and contextualized to this exact request.
- Do not output reasoning or meta commentary.
- The value is rendered into a Markdown specification: write its text as clean Markdown (`inline code`
  for identifiers, paths and commands; fenced code blocks for code snippets; emphasis where it aids clarity).
  This applies to the text INSIDE the JSON value only — never wrap the JSON object itself in a Markdown fence.
- Do not include <think> tags.
"""


# Ordine canonico dei campi dello spec — unica fonte, condivisa dai due percorsi di generazione.
# `overall_context` è generato per ultimo perché riassume i precedenti; `critique` non è un campo
# dello spec (è una valutazione a valle) e nel single_pass non viene emesso (RFC-0011 § critique).
PROMPT_SPEC_FIELDS = [
    "task_type",
    "domain",
    "role",
    "objective",
    "tone",
    "execution_steps",
    "constraints",
    "validation_rules",
    "anti_hallucination_rules",
    "system_instructions",
    "output_format",
    "overall_context",
    "directive",
]


FULL_SPEC_PROMPT = """You are an expert Prompt Enhancement Engine.

Goal:
Turn the user request below into a specification that INSTRUCTS an executing AI to perform the task directly.
The result is a briefing given TO an AI assistant, not a description ABOUT a prompt. Never restate the request
as something to analyze; convert it into concrete work to carry out. Keep every field consistent with the others.

MODE:
{mode}

USER REQUEST:
{user_input}

OUTPUT CONTRACT:
Return ONE valid JSON object and nothing else, with EXACTLY these keys:
directive, task_type, domain, role, objective, tone, execution_steps, constraints, validation_rules,
anti_hallucination_rules, system_instructions, output_format, overall_context.

TYPE RULES:
- execution_steps, constraints, validation_rules, anti_hallucination_rules, system_instructions:
  each must be an array of concise strings.
- output_format: an object with keys type (string) and structure (array of strings).
- directive, task_type, domain, role, objective, tone, overall_context: each a concise string.

FIELD GUIDANCE:
- directive: ONE direct, conversational instruction addressed straight to the AI that will do the work, as if
  the user is talking to it. Open with an action verb (Build / Create / Implement / Write / Fix ...), state
  concretely what to deliver, and end on a clear call to action. Second person, imperative. Do NOT quote or
  restate the request as meta ("generate a prompt for...", "the user wants..."); phrase it as the real task.
- role: the professional the AI should embody to DO the task (e.g. "Senior Backend Engineer"), never a
  "prompt engineer" or meta role.
- objective: the concrete outcome to achieve, phrased as the task itself, never as "write a prompt about it".

QUALITY RULES:
- Be specific and contextualized to this exact request; every field must reflect the same understanding of it.
- The string fields are rendered into a Markdown specification delivered to the executing AI: write their content
  as clean Markdown (`inline code` for identifiers, paths and commands; fenced code blocks for code snippets).
- Do not output reasoning or meta commentary. Do not wrap the JSON object in markdown — the envelope stays raw
  JSON, only the field content is Markdown. Do not include <think> tags.
"""


# Reasoning gestito NATIVAMENTE da llama-server (RFC-0014): il flag `think` viaggia fino a
# `engine.generate(..., think=)` → `chat_template_kwargs.enable_thinking` nel body OpenAI. Niente più
# prefill `<think></think>` (RFC-0013, superato): il server separa il pensiero in `reasoning_content`.


# Schema JSON per il decoding vincolato (grammar/GBNF) — usato solo se abilitato via env
# (COWORK_PROMPT_ENHANCER_GRAMMAR=1). Il percorso single_pass NON dipende da questa feature: senza
# grammar usa la generazione normale + il parser tollerante esistente. Il grammar-constrained
# decoding, dove supportato dal backend, garantisce validità strutturale by construction — ma il
# suo supporto sul modello ibrido va confermato sul target GPU prima di essere reso default (RFC-0011).
PROMPT_SPEC_RESPONSE_FORMAT = {
    "type": "json_object",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": list(PROMPT_SPEC_FIELDS),
        "properties": {
            "directive": {"type": "string"},
            "task_type": {"type": "string"},
            "domain": {"type": "string"},
            "role": {"type": "string"},
            "objective": {"type": "string"},
            "tone": {"type": "string"},
            "overall_context": {"type": "string"},
            "execution_steps": {"type": "array", "items": {"type": "string"}},
            "constraints": {"type": "array", "items": {"type": "string"}},
            "validation_rules": {"type": "array", "items": {"type": "string"}},
            "anti_hallucination_rules": {"type": "array", "items": {"type": "string"}},
            "system_instructions": {"type": "array", "items": {"type": "string"}},
            "output_format": {
                "type": "object",
                "properties": {
                    "type": {"type": "string"},
                    "structure": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["type", "structure"],
            },
        },
    },
}


# --- Intent Compiler (RFC-0018, meccanismo di RFC-0017) -------------------------------------------
# Il modulo è un Intent-to-Specification Compiler: compila un'intenzione (spesso incompleta) in una
# specifica tecnica per un altro LLM, senza alterare l'intento. Sezioni che COMPILANO la richiesta
# invece di RACCONTARLA; `Known Requirements` (esplicito) e `Inferred Requirements` (dedotto) separati
# per tracciabilità (RFC-0017 § 5). Ordine canonico, unica fonte condivisa da prompt e renderer.
# `directive` (RFC-0019) è l'head conversazionale reso PRIMA delle sezioni, non una sezione a sé.
INTENT_SPEC_FIELDS = [
    "directive",
    "task",
    "context",
    "known_requirements",
    "inferred_requirements",
    "implementation_strategy",
    "constraints",
    "quality_expectations",
    "validation_checklist",
    "output_requirements",
]


# Segnali d'azione tecnica (IT+EN): la presenza di uno solo ⇒ `technical` (attiva la Technical
# Expansion Policy e alza il budget). Deterministico, stdlib, zero chiamate al modello (RFC-0018 § 5:
# un classificatore-LLM reintrodurrebbe la catena seriale che RFC-0011 ha eliminato). Classifica il
# TIPO DI TASK, non il livello dell'utente (RFC-0017 § 1).
_TECHNICAL_SIGNAL = re.compile(
    r"\b("
    r"implement(?:a|are|ing|ed)?|build|deploy|debug|refactor(?:ing)?|"
    r"crea(?:re)?|creat(?:e|ing)|svilupp(?:a|are|o)|program(?:ma|are|ming)?|"
    r"fix|correg(?:gi|gere)|integr(?:a|are|ate|ating)|migr(?:a|are|ate|ating)|"
    r"api|endpoint|database|sql|backend|frontend|react|next\.?js|vue|angular|svelte|"
    r"docker|kubernetes|k8s|ci/?cd|pipeline|webpack|"
    r"funzione|function|classe|class|script|componente|component|"
    r"dashboard|webapp|web app|microservi(?:ce|zio)|cli|sdk|regex|"
    r"bug|test(?:s|ing)?|compil(?:a|e|are|ing)|typescript|python|rust|golang|java\b"
    r")\b",
    re.IGNORECASE,
)


def classify_target(user_input: str) -> str:
    return "technical" if _TECHNICAL_SIGNAL.search(user_input or "") else "conversational"


# COMPILER_PROMPT ordinato per il PREFIX CACHING (RFC-0024): tutto il blocco di istruzioni è FISSO e viene PRIMA
# (prefisso identico a ogni richiesta → la KV del prefisso è riusata da llama-server con `--cache-reuse`, prefill
# ~10× più veloce sotto carico); le sole parti VARIABILI (`task_kind`/`user_input`/`project_context`/`grounding`)
# sono in CODA dopo il marcatore. Riordino verificato con A/B qualità (nessuna regressione) + prefix-cache reale.
COMPILER_PROMPT = """You are an Intent-to-Specification Compiler. You transform an incomplete natural-language
request into an implementation-ready specification for ANOTHER LLM to execute. You are a compiler, not a text
expander: do not retell the request, compile it. Your job is to Infer, Expand, Complete and Specify — NOT to
design a solution. Do not assume the user's skill level; assume only that the input MAY be incomplete, and
complete it. Reduce ambiguity while preserving the user's exact intent; never change the scope of the request.

ALWAYS write the entire output in English, regardless of the language of the request.

COMPILATION PROCEDURE (reason through these internally; never output them):
1. Extract every requirement the request states explicitly.
2. Infer the requirements that are industry-standard for the request's domain.
3. Infer the technical requirements needed to implement it well.
4. Infer the quality expectations a professional would assume.
5. Remove ambiguity: where the request is underspecified, specify a sane default or state the capability.
6. Never change the user's core intent.
7. Optimize the resulting specification for consumption by another LLM.

INFERENCE RULES (this is what prevents hallucination — apply strictly):
- Infer a requirement ONLY IF at least one holds: it is universally expected for the requested technology, OR
  industry-standard for the requested domain, OR technically required to implement the request, OR it
  significantly reduces ambiguity.
- NEVER infer: a specific vendor/commercial product; an architectural preference when equivalent alternatives
  exist; optional or niche features — UNLESS the user explicitly asked for it or the request strongly implies it.
- Sort every inference into the right tier and field:
  * Explicit Intent      -> what the user said                              -> known_requirements
  * Necessary Completion -> without which the task cannot be implemented     -> inferred_requirements
  * Professional Enhancement -> what a senior would add (high confidence)    -> inferred_requirements
  Everything inferred goes under inferred_requirements, never mixed into known_requirements.

CAPABILITY OVER IMPLEMENTATION (first-class rule):
- Infer CAPABILITIES, not IMPLEMENTATIONS. When a capability has several reasonable implementations and the user
  named none, describe the capability and let the executor choose.
- OK to infer (capabilities / cross-cutting): TypeScript, responsive design, accessibility, RBAC for a business
  app, input validation, error handling, logging, authentication as a capability.
- DO NOT name, unless the user explicitly requested it: Auth.js, Clerk, Supabase, Better-Auth, Prisma, Drizzle,
  Kysely, Zustand, Redux, React Query, TanStack, or any other vendor/library/product when equivalent
  alternatives exist. Say "a secure authentication mechanism" / "a typed data-access layer" / "client-side state
  management", not the product name.
- Only name a specific technology if the user named it, OR the context genuinely narrows the choice to exactly one.

REGULATORY NUANCE:
- For compliance, infer the CAPABILITY ("support applicable data-protection/privacy regulations", "data
  export/erasure", "audit trail", "consent management"). NEVER hardcode a specific law (GDPR, CCPA, HIPAA, ...)
  unless the user named it or the jurisdiction is explicit in the request.

DOMAIN EXPANSION POLICY:
- If the request names a domain (legal, healthcare, finance, education, ecommerce, hospitality, ...), infer its
  standard entities, workflows, terminology, UX expectations, common modules and data models, per industry
  convention — always subject to the Inference Rules.

TECHNICAL EXPANSION POLICY (apply ONLY when the TASK KIND stated below is "technical"):
- Infer the missing implementation dimensions a senior would assume: project structure, architecture, error
  handling, empty/loading/error states, responsive behavior, accessibility, typing, modularity, performance,
  maintainability, testing expectations, security best practices — always subject to the Inference Rules, and
  always as capabilities, never as specific products.

OUTPUT CONTRACT:
Return ONE valid JSON object and nothing else, with EXACTLY these keys:
directive, task, context, known_requirements, inferred_requirements, implementation_strategy, constraints,
quality_expectations, validation_checklist, output_requirements.

TYPE RULES:
- directive: a concise string — ONE direct, conversational instruction addressed straight to the executing AI,
  as if the user is talking to it. Open with an action verb (Build / Create / Implement / Write / Fix ...), state
  concretely what to deliver, end on a clear call to action. Second person, imperative. Do NOT quote or restate
  the request as meta ("generate a prompt for...", "the user wants...").
- task: a concise string — one imperative definition of the ACTUAL engineering work to perform. Open with a
  concrete action verb (Implement / Build / Add / Fix / Refactor ...), second person. NEVER frame it as producing
  a document about the work: forbidden openings include "Generate a specification…", "Create a prompt…", "Write a
  spec/plan for…", "Produce a specification…". State the real task itself (e.g. "Implement login and logout…"),
  exactly like directive.
- context: a concise string — the minimal background needed to execute. May be an empty string.
- known_requirements, inferred_requirements, implementation_strategy, constraints, quality_expectations,
  validation_checklist, output_requirements: each an array of concise strings. Any array that does not apply to
  this request MUST be empty — never pad.

DENSITY:
- Maximize information per token. No filler, no restating, no repetition across sections. Prefer few precise
  items over many vague ones.

OUTPUT MEDIUM:
- The string fields are rendered verbatim into a Markdown specification delivered to the executing AI: write
  their content as clean Markdown (`inline code` for identifiers, paths and commands; fenced code blocks for
  code snippets; emphasis where it aids clarity). This concerns only the CONTENT of the string values.

Do not output reasoning or meta commentary. Do not wrap the JSON object in markdown — the envelope stays raw
JSON, only the field content is Markdown. Do not include <think> tags.

--- The fixed instructions end here. Everything below is the specific request to compile. ---

TASK KIND: {task_kind}

REQUEST:
{user_input}
{project_context}{grounding}
Compile the REQUEST above into the JSON object now, following all the rules above."""


# Blocco `RETRIEVED CONTEXT` (RFC-0019 aggancio, RFC-0020 semantica): iniettato solo quando il grounding
# web è presente. Le graffe letterali sono raddoppiate perché passa per `str.format`. Istruisce il modello
# a trattare i risultati come EVIDENZA, non come requisiti — subordinati alle Inference Rules.
GROUNDING_BLOCK = """
RETRIEVED CONTEXT (live web results — may be noisy or dated):
{results}
Use this ONLY to correct or update facts you are unsure about. It is evidence, not requirements: do NOT add
features just because a result mentions them, and keep every inference subject to the Inference Rules above.
"""


# Blocco `PROJECT CONTEXT` (RFC-0021): la mappa ad albero della struttura + i file reali del progetto
# dell'utente. A differenza del web grounding (evidenza), questo è VERITÀ AUTOREVOLE sul codice esistente:
# il compiler vi si ancora invece di indovinare stack/struttura. Non è una richiesta di modifica: è lo
# stato attuale da rispettare. La sezione `Directory tree` mappa l'intero progetto; `Selected file
# contents` (se presente) dà il contenuto integrale dei file scelti.
PROJECT_CONTEXT_BLOCK = """
PROJECT CONTEXT (authoritative — the directory tree and real file contents from the user's existing project;
treat as ground truth for the project's structure, stack and conventions, and stay consistent with them; do not
restate them as requirements):
{files}
"""


def normalize_generated_prompt(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return cleaned

    cleaned = re.sub(r"^(here is|ecco)\b[^\n]*\n+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\*\*\*\s*\n+", "", cleaned)

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", cleaned)
        cleaned = cleaned.replace("```", "").strip()

    return cleaned


def field_fallback(target_field: str, user_input: str, mode: str) -> object:
    text = (user_input or "").strip()

    # Ruoli-mestiere per l'esecuzione del task (RFC-0012), non ruoli "prompt engineer": l'output è
    # una consegna DIRETTA a un AI che esegue, non un meta-documento di prompt engineering.
    lower = text.lower()
    role = "Senior Software Engineer"
    if any(k in lower for k in ["fastapi", "backend", "api", "database", "sql", "jwt", "auth"]):
        role = "Senior Backend Engineer"
    elif any(k in lower for k in ["next.js", "nextjs", "react", "frontend", "ui", "ux", "css"]):
        role = "Senior Frontend Engineer"
    elif any(k in lower for k in ["devops", "docker", "kubernetes", "ci", "cd", "pipeline"]):
        role = "Senior DevOps Engineer"
    elif any(k in lower for k in ["markdown", "readme", "documentazione", "documentation", ".md"]):
        role = "Senior Technical Writer"
    elif any(k in lower for k in ["debug", "bug", "fix", "errore", "error", "troubleshoot"]):
        role = "Senior Software Engineer specializing in debugging"

    defaults = {
        "task_type": "analysis",
        "role": role,
        # directive/objective NON rieccheggiano né incorniciano il testo come "un prompt": è il task
        # da svolgere, in seconda persona (RFC-0012). Fallback last-resort: generico ma non-meta.
        "directive": "Complete the task described in the specification below. Deliver a complete, correct, production-ready result, and follow the specification as your guide.",
        "objective": "Deliver a complete, correct, production-ready result that fully satisfies the requested task.",
        "domain": "software engineering",
        "context": text,
        "tone": "precise, technical, operational",
        "overall_context": "Produce a complete and coherent result that an AI assistant can execute directly with minimal ambiguity.",
        "execution_steps": [
            "Extract intent, constraints, and technical scope from user request.",
            "Define an implementation-ready structure with explicit deliverables.",
            "Generate final prompt sections with concrete instructions.",
            "Validate that output is consistent, complete, and non-hallucinatory.",
        ],
        "constraints": [
            "Avoid generic statements and keep instructions explicit.",
            "Do not invent unsupported facts or dependencies.",
            "Respect all stack and architecture constraints from user request.",
        ],
        "validation_rules": [
            "All requested components must be covered.",
            "Architecture constraints must be respected.",
            "Output must be directly actionable by an AI coding agent.",
        ],
        "anti_hallucination_rules": [
            "Do not invent files, APIs, or tools not implied by request.",
            "If uncertain, mark assumptions explicitly.",
        ],
        "system_instructions": [
            "Prefer concrete implementation steps over high-level advice.",
            "Keep output optimized for execution quality.",
            "Preserve consistency across all sections.",
        ],
        "output_format": {
            "type": "markdown",
            "structure": [
                "role",
                "objective",
                "overall_context",
                "execution_steps",
                "constraints",
                "validation_rules",
                "output_format",
            ],
        },
    }

    return defaults.get(target_field, "")


def extract_json_objects(text: str) -> list:
    cleaned = normalize_generated_prompt(text)
    if not cleaned:
        return []

    decoder = json.JSONDecoder()
    objects = []
    idx = 0
    while idx < len(cleaned):
        if cleaned[idx] != "{":
            idx += 1
            continue

        try:
            obj, end = decoder.raw_decode(cleaned[idx:])
        except json.JSONDecodeError:
            idx += 1
            continue

        if isinstance(obj, dict):
            objects.append(obj)
        idx += end

    return objects


def extract_value_from_mixed_output(target_field: str, raw: str) -> object:
    objects = extract_json_objects(raw)
    if not objects:
        return None

    # Prefer explicit {"value": ...} blocks and take the latest one.
    for obj in reversed(objects):
        if "value" in obj:
            return obj.get("value")

    # Some models return {"task_type": "..."} or {"role": "..."}.
    for obj in reversed(objects):
        if target_field in obj:
            return obj.get(target_field)

    return None


def coerce_value_from_raw(target_field: str, raw: str, user_input: str, mode: str) -> object:
    cleaned = normalize_generated_prompt(raw)
    if not cleaned:
        return field_fallback(target_field, user_input, mode)

    extracted = extract_value_from_mixed_output(target_field, raw)
    if extracted is not None:
        return normalize_field_value(target_field, extracted, user_input, mode)

    list_fields = {
        "execution_steps",
        "constraints",
        "validation_rules",
        "anti_hallucination_rules",
        "system_instructions",
    }

    if target_field in list_fields:
        items = []
        for line in cleaned.splitlines():
            item = re.sub(r"^\s*(?:[-*]|\d+[.)])\s+", "", line).strip()
            if item:
                items.append(item)
        if not items:
            return field_fallback(target_field, user_input, mode)
        return normalize_field_value(target_field, items, user_input, mode)

    if target_field == "output_format":
        try:
            parsed = json.loads(cleaned)
            return normalize_field_value(target_field, parsed, user_input, mode)
        except Exception:
            return field_fallback(target_field, user_input, mode)

    # Scalar fields: accept plain text, but drop common JSON-wrapper boilerplate.
    scalar = re.sub(r"(?im)^\s*-?\s*do not include any text outside the json\.?\s*$", "", cleaned)
    scalar = re.sub(r"(?im)^\s*here is the json output:\s*$", "", scalar)
    scalar = re.sub(r"(?is)\{[\s\S]*?\}", " ", scalar)
    scalar = " ".join(scalar.split()).strip()

    if not scalar:
        return field_fallback(target_field, user_input, mode)

    return normalize_field_value(target_field, scalar, user_input, mode)


def normalize_field_value(target_field: str, value: object, user_input: str, mode: str) -> object:
    list_fields = {
        "execution_steps",
        "constraints",
        "validation_rules",
        "anti_hallucination_rules",
        "system_instructions",
    }

    if target_field in list_fields:
        if not isinstance(value, list):
            return field_fallback(target_field, user_input, mode)
        cleaned_items = [str(v).strip() for v in value if str(v).strip()]
        return cleaned_items if cleaned_items else field_fallback(target_field, user_input, mode)

    if target_field == "output_format":
        if not isinstance(value, dict):
            return field_fallback(target_field, user_input, mode)
        out_type = str(value.get("type", "")).strip()
        structure = value.get("structure")
        if not isinstance(structure, list):
            structure = []
        structure = [str(v).strip() for v in structure if str(v).strip()]
        if not out_type:
            out_type = "markdown"
        if not structure:
            structure = field_fallback(target_field, user_input, mode)["structure"]
        return {"type": out_type, "structure": structure}

    text = str(value or "").strip()
    return text if text else field_fallback(target_field, user_input, mode)


def generate_field(engine, target_field: str, user_input: str, mode: str, current_context: dict, think: bool = False) -> object:
    prompt = SINGLE_ENHANCER_PROMPT.format(
        mode=mode,
        user_input=user_input,
        current_context_json=json.dumps(current_context, ensure_ascii=True, indent=2),
        target_field=target_field,
    )

    # Cap di output per campo: 320 (RFC-0011 amendment 2026-07-07). Il triplo (960) misurato il
    # 2026-07-06 è stato REVERTATO: sul modello reale, dato più spazio per un singolo campo, il
    # modello riempie con filler ripetitivo (campi da 45 voci degeneri) invece di fermarsi — 320 è
    # la quality-control per il per-campo. Il field_loop è comunque solo il fallback: il default è
    # single_pass (dove il budget è per lo spec intero, 4608, e il modello si ferma naturalmente).
    field_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_FIELD_TOKENS", "320"))
    raw = engine.generate(prompt, max_new_tokens=field_tokens, think=think)
    raw = normalize_generated_prompt(raw)

    parsed = None
    try:
        parsed = engine.extract_json(raw)
    except Exception:
        parsed = None

    if isinstance(parsed, dict) and "value" in parsed:
        return normalize_field_value(target_field, parsed.get("value"), user_input, mode)

    if isinstance(parsed, dict) and target_field in parsed:
        return normalize_field_value(target_field, parsed.get(target_field), user_input, mode)

    return coerce_value_from_raw(target_field, raw, user_input, mode)


def build_compiled_prompt(spec: dict) -> str:
    # RFC-0012: il prompt consegnato è una consegna DIRETTA a un AI esecutore. Apre con `directive`
    # (CTA conversazionale in seconda persona) e usa il resto come guida. NON rieccheggia più il
    # prompt grezzo dell'utente (niente blocco `# Context` = user_input verbatim): quell'eco faceva
    # sì che l'AI a valle lo scambiasse per un meta-prompt / prompt injection e rifiutasse.
    directive = str(spec.get("directive", "")).strip() or "Complete the task described below and deliver a complete, production-ready result."
    role = spec.get("role", "Senior Software Engineer")
    objective = spec.get("objective", "Deliver a complete, production-ready result.")
    overall_context = spec.get("overall_context", "")

    execution_steps = spec.get("execution_steps", [])
    constraints = spec.get("constraints", [])
    validation_rules = spec.get("validation_rules", [])
    anti_hallucination_rules = spec.get("anti_hallucination_rules", [])
    system_instructions = spec.get("system_instructions", [])

    lines = [
        directive,
        "",
        "Use the specification below as your guide.",
        "",
        "# Role",
        str(role),
        "",
        "# Objective",
        str(objective),
        "",
        "# Overall Context",
        str(overall_context),
        "",
        "# Execution Steps",
    ]

    lines.extend([f"- {item}" for item in execution_steps])

    lines.extend(["", "# Constraints"])
    lines.extend([f"- {item}" for item in constraints])

    lines.extend(["", "# Validation Rules"])
    lines.extend([f"- {item}" for item in validation_rules])

    lines.extend(["", "# Anti-Hallucination Rules"])
    lines.extend([f"- {item}" for item in anti_hallucination_rules])

    lines.extend(["", "# System Instructions"])
    lines.extend([f"- {item}" for item in system_instructions])

    return "\n".join(lines).strip()


def generate_full_spec(engine, user_input: str, mode: str, think: bool = False) -> dict:
    """Genera l'intero PromptSpec in una sola chiamata al modello — RFC-0011.

    Ogni chiave del JSON prodotto è validata/normalizzata con lo stesso `normalize_field_value`
    del percorso field-loop: una chiave mancante o di tipo errato ricade su `field_fallback`, così
    lo spec risultante è sempre completo e coerente in tipo. Solleva `ValueError` se il modello non
    produce alcun oggetto JSON utile — il chiamante (`run_enhancement`) lo intercetta e ricade sul
    field-loop, garantendo nessuna regressione osservabile rispetto al comportamento storico."""
    prompt = FULL_SPEC_PROMPT.format(mode=mode, user_input=user_input)
    # L'intero spec (12 campi) in una risposta è grande: cap triplicato 1536→4608
    # (RFC-0011 amendment 2026-07-06) per non troncare lo spec generato.
    max_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_SPEC_TOKENS", "4608"))

    response_format = PROMPT_SPEC_RESPONSE_FORMAT if os.getenv("COWORK_PROMPT_ENHANCER_GRAMMAR") == "1" else None

    raw = None
    if response_format is not None:
        try:
            raw = engine.generate(prompt, max_new_tokens=max_tokens, response_format=response_format, think=think)
        except Exception:
            # Il backend può non onorare il response_format: ricadi sulla generazione normale + parser
            # tollerante, senza perdere il beneficio del single-pass.
            raw = None
    if raw is None:
        raw = engine.generate(prompt, max_new_tokens=max_tokens, think=think)

    raw = normalize_generated_prompt(raw)

    parsed = None
    try:
        parsed = engine.extract_json(raw)
    except Exception:
        parsed = None
    if not isinstance(parsed, dict):
        objects = extract_json_objects(raw)
        parsed = objects[-1] if objects else None
    if not isinstance(parsed, dict):
        raise ValueError("single_pass: nessun oggetto JSON estraibile dallo spec generato")

    spec = {
        "task_type": "analysis",
        "complexity_level": mode,
        "context": user_input,
    }
    for field_name in PROMPT_SPEC_FIELDS:
        spec[field_name] = normalize_field_value(field_name, parsed.get(field_name), user_input, mode)

    return spec


# Sezioni della specifica compilata, nell'ordine di resa (RFC-0018 § 2). `list_field=False` → scalare,
# reso sotto l'header solo se non vuoto; `True` → lista, header + bullet solo se la lista non è vuota.
# Le sezioni vuote NON sono rese: nessun header penzolante, la struttura si adatta alla richiesta.
# `Role`/`Objective`/`Overall Context` non esistono più (assorbite da `Task`/`Context`).
_COMPILER_SECTIONS = [
    ("# Task", "task", False),
    ("# Context", "context", False),
    ("# Known Requirements", "known_requirements", True),
    ("# Inferred Requirements", "inferred_requirements", True),
    ("# Implementation Strategy", "implementation_strategy", True),
    ("# Constraints", "constraints", True),
    ("# Quality Expectations", "quality_expectations", True),
    ("# Validation Checklist", "validation_checklist", True),
    ("# Output Requirements", "output_requirements", True),
]


def build_specification(spec: dict) -> str:
    # Head conversazionale (RFC-0019, ripristino di RFC-0012 nel percorso compiler): il prompt consegnato
    # apre con una frase in seconda persona + riga-ponte PRIMA di `# Task`. Scopo doppio: CTA diretta
    # all'AI esecutore, e far leggere il prompt come scritto da un umano (non un meta-template) così l'AI
    # a valle non lo scambi per prompt-injection. Niente eco del prompt grezzo (principio RFC-0012/0018).
    lines = []
    directive = str(spec.get("directive", "")).strip()
    if directive:
        lines.extend([directive, "", "Use the specification below as your guide."])

    for header, field_name, is_list in _COMPILER_SECTIONS:
        value = spec.get(field_name)
        if is_list:
            items = [str(item).strip() for item in value] if isinstance(value, list) else []
            items = [item for item in items if item]
            if not items:
                continue
            if lines:
                lines.append("")
            lines.append(header)
            lines.extend([f"- {item}" for item in items])
        else:
            text = str(value or "").strip()
            if not text:
                continue
            if lines:
                lines.append("")
            lines.extend([header, text])

    return "\n".join(lines).strip()


_COMPILER_LIST_FIELDS = {
    "known_requirements",
    "inferred_requirements",
    "implementation_strategy",
    "constraints",
    "quality_expectations",
    "validation_checklist",
    "output_requirements",
}

# Fallback last-resort degli scalari non-vuoti (RFC-0017: non riempire, non inventare — le liste mancanti
# restano vuote e la loro sezione sparisce; solo `task` e `directive` devono esistere perché il compilato
# abbia senso e apra sempre con l'head conversazionale — RFC-0019).
_COMPILER_TASK_FALLBACK = "Complete the task described below and deliver a complete, correct, production-ready result."
_COMPILER_DIRECTIVE_FALLBACK = "Complete the task described in the specification below and deliver a complete, correct, production-ready result."


def normalize_compiler_field(field_name: str, raw_value: object) -> object:
    # Conforme a RFC-0017: una lista PRESENTE è rispettata anche se vuota; una lista mancante/di tipo
    # errato diventa vuota (mai boilerplate) — non si riempie ciò che il modello non ha dedotto. Gli
    # scalari: `task`/`directive` hanno un fallback non-vuoto, `context` può restare vuoto (sezione saltata).
    if field_name in _COMPILER_LIST_FIELDS:
        if isinstance(raw_value, list):
            return [str(item).strip() for item in raw_value if str(item).strip()]
        return []
    text = str(raw_value or "").strip()
    if field_name == "task":
        return text or _COMPILER_TASK_FALLBACK
    if field_name == "directive":
        return text or _COMPILER_DIRECTIVE_FALLBACK
    return text


def compile_intent(engine, user_input: str, mode: str, think: bool = False, grounding: str = "", project_context: str = "") -> tuple:
    """Compila l'intento in una specifica, in UNA chiamata — RFC-0018. Ritorna `(spec, task_kind)`.
    Le fasi del compilatore vivono dentro il prompt (single-call: RFC-0011 § latenza). `grounding` è il
    testo grezzo dei risultati web (RFC-0020, evidenza); `project_context` sono i file reali del progetto
    (RFC-0021, verità autorevole). Entrambi vuoti ⇒ prompt invariato. Solleva `ValueError` se il modello
    non produce JSON estraibile; il chiamante ricade sul field-loop."""
    task_kind = classify_target(user_input)
    grounding_block = GROUNDING_BLOCK.format(results=grounding) if grounding.strip() else ""
    project_block = PROJECT_CONTEXT_BLOCK.format(files=project_context) if project_context.strip() else ""
    prompt = COMPILER_PROMPT.format(
        task_kind=task_kind,
        user_input=user_input,
        project_context=project_block,
        grounding=grounding_block,
    )
    max_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_COMPILER_TOKENS", "2048"))

    raw = engine.generate(prompt, max_new_tokens=max_tokens, think=think)
    raw = normalize_generated_prompt(raw)

    parsed = None
    try:
        parsed = engine.extract_json(raw)
    except Exception:
        parsed = None
    if not isinstance(parsed, dict):
        objects = extract_json_objects(raw)
        parsed = objects[-1] if objects else None
    if not isinstance(parsed, dict):
        raise ValueError("compiler: nessun oggetto JSON estraibile dalla specifica generata")

    spec = {
        "task_type": "analysis",
        "complexity_level": mode,
        "task_kind": task_kind,
        "source_input": user_input,
    }
    for field_name in INTENT_SPEC_FIELDS:
        spec[field_name] = normalize_compiler_field(field_name, parsed.get(field_name))

    return spec, task_kind


def run_enhancement_field_loop(engine, user_input: str, mode: str, think: bool = False) -> tuple:
    """Percorso storico, copia fedele (RFC-0005 § crit. 4): 12 campi + `critique`, uno per chiamata."""
    spec = {
        "task_type": "analysis",
        "complexity_level": mode,
        "context": user_input,
    }

    debug_fields = {}
    for field_name in PROMPT_SPEC_FIELDS:
        value = generate_field(
            engine=engine,
            target_field=field_name,
            user_input=user_input,
            mode=mode,
            current_context=spec,
            think=think,
        )
        spec[field_name] = value
        debug_fields[field_name] = value

    compiled_prompt = normalize_generated_prompt(build_compiled_prompt(spec))

    critique = str(
        generate_field(
            engine=engine,
            target_field="critique",
            user_input=user_input,
            mode=mode,
            current_context={"compiled_prompt": compiled_prompt, "spec": spec},
            think=think,
        )
    ).strip()

    return spec, compiled_prompt, critique, debug_fields


def run_enhancement(engine, user_input: str, mode: str, think: bool = False, search: bool | None = None,
                    project_context: str = "", deep_research: bool = False) -> dict:
    # think: reasoning del modello. Default OFF (RFC-0013) — deterministico e senza picchi di latenza;
    # ON lascia ragionare il modello (più lento e variabile). Il client lo sceglie via terminale.
    # search: grounding web (RFC-0020). None ⇒ decide il gate (env COWORK_PROMPT_ENHANCER_SEARCH,
    # default `auto`: cerca solo su segnale di freschezza); True forza; solo il percorso `compiler` lo usa.
    # project_context: file reali del progetto (RFC-0021, verità autorevole), vuoto per il tool generale.
    # deep_research: passaggio di ricerca multi-query opt-in (RFC-0022) → produce anche `research` (2° output).
    strategy = os.getenv("COWORK_PROMPT_ENHANCER_STRATEGY", "compiler").strip().lower()

    spec = compiled_prompt = None
    critique = ""
    research = ""
    debug_fields: dict = {}
    generation_mode = "single_generic_prompt_template"
    grounded = False

    if strategy == "compiler":
        try:
            grounding = gather_grounding(user_input, search)
            # Deep research (RFC-0022): opt-in, multi-chiamata (rompe il single-call di RFC-0018 di
            # proposito). Il report sintetizzato è il secondo output E alimenta il compile come evidenza.
            if deep_research:
                research = run_deep_research(engine, user_input, think=think)
                if research:
                    grounding = f"{grounding}\n\n{research}".strip() if grounding else research
            grounded = bool(grounding)
            spec, task_kind = compile_intent(
                engine, user_input, mode, think=think, grounding=grounding, project_context=project_context
            )
            compiled_prompt = normalize_generated_prompt(build_specification(spec))
            debug_fields = {field: spec[field] for field in INTENT_SPEC_FIELDS}
            generation_mode = f"compiler_{task_kind}"
        except Exception:
            # Stesso confine d'errore di single_pass: su fallimento di parsing si ricade sul field-loop
            # validato (nessuna regressione osservabile). Il boundary è qui, non in compile_intent.
            spec = None
    elif strategy == "single_pass":
        try:
            spec = generate_full_spec(engine, user_input, mode, think=think)
            compiled_prompt = normalize_generated_prompt(build_compiled_prompt(spec))
            debug_fields = {field: spec[field] for field in PROMPT_SPEC_FIELDS}
            generation_mode = "single_pass_full_spec"
        except Exception:
            # Fallback esplicito e silenzioso-per-l'utente ma tracciato nel debug: il single_pass ha
            # fallito, si serve comunque la richiesta col percorso storico validato (nessuna
            # regressione). Il confine di errore è qui, non dentro generate_full_spec.
            spec = None

    if spec is None:
        spec, compiled_prompt, critique, debug_fields = run_enhancement_field_loop(engine, user_input, mode, think=think)
        generation_mode = "single_generic_prompt_template"

    debug = {
        "generation_mode": generation_mode,
        "think": think,
        "grounded": grounded,
        "deep_research": bool(research),
        "has_project_context": bool(project_context.strip()),
        "fields": debug_fields,
        "compiled_prompt": compiled_prompt,
        "critique": critique,
    }

    return {
        "task_type": str(spec.get("task_type", "analysis")),
        "prompt_spec": spec,
        "compiled_prompt": compiled_prompt,
        "research": research,
        "critique": critique,
        "gpu": engine.gpu_info(),
        "debug": debug,
    }
