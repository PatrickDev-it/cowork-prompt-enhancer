"""The three generation strategies — split out of `workflow.py` per RFC-0025 Phase 2.3:
`compile_intent` (compiler, RFC-0018), `generate_full_spec` (single_pass, RFC-0011), and
`run_enhancement_field_loop` (field_loop, RFC-0005 § crit. 4 — **must not be altered**; copied
here verbatim, unchanged, from `workflow.py`). `workflow.py`'s `run_enhancement` orchestrates
across all three and owns their shared fallback boundary; this module only implements each
strategy in isolation."""

import json
import os
import re

from coercion import (
    build_compiled_prompt,
    coerce_value_from_raw,
    extract_json_objects,
    normalize_field_value,
    normalize_generated_prompt,
)
from prompts import (
    COMPILER_PROMPT,
    FULL_SPEC_PROMPT,
    GROUNDING_BLOCK,
    INTENT_SPEC_FIELDS,
    PROJECT_CONTEXT_BLOCK,
    PROMPT_SPEC_FIELDS,
    PROMPT_SPEC_RESPONSE_FORMAT,
    SINGLE_ENHANCER_PROMPT,
)

# Technical-action signals (IT+EN): the presence of just one ⇒ `technical` (activates the Technical
# Expansion Policy and raises the budget). Deterministic, stdlib, zero model calls (RFC-0018 § 5: an
# LLM classifier would reintroduce the serial chain RFC-0011 eliminated). Classifies the TASK TYPE,
# not the user's skill level (RFC-0017 § 1).
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


def generate_field(
    engine, target_field: str, user_input: str, mode: str, current_context: dict, think: bool = False
) -> object:
    prompt = SINGLE_ENHANCER_PROMPT.format(
        mode=mode,
        user_input=user_input,
        current_context_json=json.dumps(current_context, ensure_ascii=True, indent=2),
        target_field=target_field,
    )

    # Per-field output cap: 320 (RFC-0011 amendment 2026-07-07). Tripling it (960), measured on
    # 2026-07-06, was REVERTED: on the real model, given more room for a single field, it fills with
    # repetitive filler (fields with 45 degenerate entries) instead of stopping — 320 is the quality
    # control for the per-field path. field_loop is only the fallback anyway: the default is
    # single_pass (where the budget is for the whole spec, 4608, and the model stops naturally).
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


def generate_full_spec(engine, user_input: str, mode: str, think: bool = False) -> dict:
    """Generates the entire PromptSpec in a single model call — RFC-0011.

    Every key of the produced JSON is validated/normalized with the same `normalize_field_value`
    used by the field-loop path: a missing or wrong-typed key falls back to `field_fallback`, so the
    resulting spec is always complete and type-consistent. Raises `ValueError` if the model produces
    no usable JSON object — the caller (`workflow.run_enhancement`) catches it and falls back to
    field-loop, guaranteeing no observable regression versus the historical behavior."""
    prompt = FULL_SPEC_PROMPT.format(mode=mode, user_input=user_input)
    # The whole spec (12 fields) in one response is large: cap tripled 1536→4608
    # (RFC-0011 amendment 2026-07-06) so the generated spec isn't truncated.
    max_tokens = int(os.getenv("COWORK_PROMPT_ENHANCER_SPEC_TOKENS", "4608"))

    response_format = PROMPT_SPEC_RESPONSE_FORMAT if os.getenv("COWORK_PROMPT_ENHANCER_GRAMMAR") == "1" else None

    raw = None
    if response_format is not None:
        try:
            raw = engine.generate(prompt, max_new_tokens=max_tokens, response_format=response_format, think=think)
        except Exception:
            # The backend may not honor response_format: fall back to normal generation + the
            # tolerant parser, without losing single-pass's benefit.
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
        raise ValueError("single_pass: no JSON object extractable from the generated spec")

    spec = {
        "task_type": "analysis",
        "complexity_level": mode,
        "context": user_input,
    }
    for field_name in PROMPT_SPEC_FIELDS:
        spec[field_name] = normalize_field_value(field_name, parsed.get(field_name), user_input, mode)

    return spec


# Compiler-strategy fallback constants (RFC-0017: never pad, never invent — missing lists stay empty
# and their section disappears; only `task` and `directive` must exist for the compiled output to
# make sense and always open with the conversational head — RFC-0019).
_COMPILER_LIST_FIELDS = {
    "known_requirements",
    "inferred_requirements",
    "implementation_strategy",
    "constraints",
    "quality_expectations",
    "validation_checklist",
    "output_requirements",
}
_COMPILER_TASK_FALLBACK = "Complete the task described below and deliver a complete, correct, production-ready result."
_COMPILER_DIRECTIVE_FALLBACK = (
    "Complete the task described in the specification below and deliver a complete, correct, production-ready result."
)


def normalize_compiler_field(field_name: str, raw_value: object) -> object:
    # Per RFC-0017: a PRESENT list is respected even if empty; a missing/wrong-typed list becomes
    # empty (never boilerplate) — nothing is padded in for what the model didn't infer. Scalars:
    # `task`/`directive` get a non-empty fallback, `context` may stay empty (its section is skipped).
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


def compile_intent(
    engine, user_input: str, mode: str, think: bool = False, grounding: str = "", project_context: str = ""
) -> tuple:
    """Compiles the intent into a specification, in ONE call — RFC-0018. Returns `(spec, task_kind)`.
    The compiler's phases live inside the prompt (single-call: RFC-0011 § latency). `grounding` is
    the raw text of web results (RFC-0020, evidence); `project_context` is the user's real project
    files (RFC-0021, authoritative truth). Both empty ⇒ prompt unchanged. Raises `ValueError` if the
    model produces no extractable JSON; the caller falls back to field-loop."""
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
        raise ValueError("compiler: no JSON object extractable from the generated specification")

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
    """Historical path, faithful copy (RFC-0005 § crit. 4): 12 fields + `critique`, one call each."""
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
