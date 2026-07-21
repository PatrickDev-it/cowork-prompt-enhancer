"""Parsing, coercion, and rendering — split out of `workflow.py` per RFC-0025 Phase 2.3. These are
the pure functions that absorb an LLM's unpredictable output: no model calls, no I/O, no imports
from `strategies.py` or `workflow.py` (kept that way deliberately — both of those import FROM this
module, and `strategies.py` also imports from `workflow.py`, so this module must stay a leaf to
avoid a cycle). Covered by `tests/test_workflow.py` (RFC-0025 Phase 1.1); this split was done only
after those tests existed, so the refactor is verified by a green suite, not by manual re-reading.

`build_compiled_prompt` lives here rather than in `workflow.py`, as a deliberate, documented
deviation from RFC-0025's literal Phase 2.3 wording: it is called both by `strategies.py`'s
`run_enhancement_field_loop` and by `workflow.py`'s `run_enhancement` (single_pass branch), so
placing it in either of those two modules would create an import cycle. As a pure spec→string
renderer with no strategy-specific logic, it belongs with the rest of this module's pure functions
at least as much as it belongs in either caller — see `.sinapsi/decisions.md`."""

import json
import re


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

    # Job-shaped roles for executing the task (RFC-0012), not "prompt engineer" roles: the output is
    # a DIRECT deliverable to an executing AI, not a meta-document about prompt engineering.
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
        # directive/objective never echo or frame the text as "a prompt": it's the task to carry
        # out, second person (RFC-0012). Last-resort fallback: generic, but never meta.
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


def build_compiled_prompt(spec: dict) -> str:
    # RFC-0012: the delivered prompt is a DIRECT deliverable to an executing AI. Opens with
    # `directive` (a second-person conversational CTA) and uses the rest as its guide. It no longer
    # echoes the user's raw prompt (no `# Context` block = user_input verbatim): that echo made a
    # downstream AI mistake it for a meta-prompt / prompt injection and refuse it.
    directive = (
        str(spec.get("directive", "")).strip()
        or "Complete the task described below and deliver a complete, production-ready result."
    )
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
