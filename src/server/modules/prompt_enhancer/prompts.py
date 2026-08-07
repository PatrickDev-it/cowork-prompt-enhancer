"""Prompt templates and field/section ordering constants for the prompt-enhancer — split out of
`workflow.py` per RFC-0025 Phase 2.3. Pure data: no logic, no imports beyond stdlib typing. Shared
by `strategies.py` (which fills these templates and iterates these field lists) and `workflow.py`
(which needs the same field lists to build `debug.fields` for whichever strategy ran)."""

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


# Canonical field order for the historical spec — the single source shared by both generation paths
# that use it (field_loop, single_pass). `overall_context` is generated last because it summarizes
# the others; `critique` is not a spec field (it's a downstream evaluation) and single_pass never
# emits it (RFC-0011 § critique).
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


# Reasoning is handled NATIVELY by llama-server (RFC-0014): the `think` flag travels through to
# `engine.generate(..., think=)` → `chat_template_kwargs.enable_thinking` in the OpenAI body. No more
# `<think></think>` prefill (RFC-0013, superseded): the server separates reasoning into `reasoning_content`.


# JSON schema for constrained decoding (grammar/GBNF) — used only when enabled via env
# (COWORK_PROMPT_ENHANCER_GRAMMAR=1). The single_pass path does NOT depend on this feature: without
# a grammar it uses normal generation + the existing tolerant parser. Grammar-constrained decoding,
# where the backend supports it, guarantees structural validity by construction — but support on the
# hybrid model needed confirming on the target GPU before being made default (RFC-0011).
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


# --- Intent Compiler (RFC-0018, the mechanism RFC-0017 describes) --------------------------------
# The module is an Intent-to-Specification Compiler: it compiles an (often incomplete) intent into a
# technical specification for another LLM, without altering that intent. Sections COMPILE the request
# instead of NARRATING it; `known_requirements` (explicit) and `inferred_requirements` (deduced) are
# tracked separately for traceability (RFC-0017 § 5). Canonical order, the single source shared by the
# prompt and the renderer. `directive` (RFC-0019) is the conversational head rendered BEFORE the
# sections, not a section of its own.
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


# COMPILER_PROMPT is ordered for PREFIX CACHING (RFC-0024): the entire instruction block is FIXED and
# comes FIRST (an identical prefix on every request → llama-server's `--cache-reuse` reuses the
# prefix's KV, prefill ~10x faster under load); only the VARIABLE parts (`task_kind`/`user_input`/
# `project_context`/`grounding`) come after the marker. This ordering was verified with an A/B quality
# check (no regression) plus real prefix-cache hits.
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


# `RETRIEVED CONTEXT` block (RFC-0019 hook, RFC-0020 semantics): injected only when web grounding is
# present. Literal braces are doubled because this passes through `str.format`. Instructs the model to
# treat the results as EVIDENCE, not requirements — subordinate to the Inference Rules.
GROUNDING_BLOCK = """
RETRIEVED CONTEXT (live web results — may be noisy or dated):
{results}
Use this ONLY to correct or update facts you are unsure about. It is evidence, not requirements: do NOT add
features just because a result mentions them, and keep every inference subject to the Inference Rules above.
"""


# `PROJECT CONTEXT` block (RFC-0021): the directory-tree map plus the user's real project files. Unlike
# web grounding (evidence), this is AUTHORITATIVE TRUTH about the existing code: the compiler anchors to
# it instead of guessing stack/structure. It is not a request to change anything — it's the current state
# to respect. The `Directory tree` section maps the whole project; `Selected file contents` (if present)
# gives the full content of the chosen files.
PROJECT_CONTEXT_BLOCK = """
PROJECT CONTEXT (authoritative — the directory tree and real file contents from the user's existing project;
treat as ground truth for the project's structure, stack and conventions, and stay consistent with them; do not
restate them as requirements):
{files}
"""


# Rendering order for the compiled specification (RFC-0018 § 2), consumed by `workflow.build_specification`.
# `list_field=False` → scalar, rendered under its header only if non-empty; `True` → list, header + bullets
# only if the list is non-empty. Empty sections are never rendered: no dangling header, the structure adapts
# to the request. `Role`/`Objective`/`Overall Context` no longer exist (absorbed by `Task`/`Context`).
COMPILER_SECTIONS = [
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
