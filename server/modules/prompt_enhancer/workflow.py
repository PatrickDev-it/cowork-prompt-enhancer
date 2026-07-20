"""Prompt enhancement orchestration. Three spec-generation strategies, all behind
`run_enhancement` (same result-dict shape) — RFC-0005, RFC-0010, RFC-0011, RFC-0017, RFC-0018.

- `compiler` (**default**, RFC-0018) — the module as an **Intent-to-Specification Compiler**
  (RFC-0017): a single call (`compile_intent`, in `strategies.py`) internally runs the pipeline
  (intent extraction → implicit-requirement inference → domain/technical expansion → LLM
  optimization) and emits JSON with sections that *compile* the request instead of *narrating* it
  (`Task`/`Context`/`Known Requirements`/`Inferred Requirements`/…). Output always in English;
  explicit vs. inferred tracked separately. Rendered here by `build_specification` (empty sections
  skipped). On parse failure → `field_loop`.
- `single_pass` (RFC-0011, opt-in) — a single call (`generate_full_spec`, in `strategies.py`)
  generates the historical 13-field PromptSpec via `FULL_SPEC_PROMPT`, rendered by
  `build_compiled_prompt` (in `coercion.py`). Selectable fallback via env var.
- `field_loop` (RFC-0005 § crit. 4) — the historical logic, in `strategies.py` as
  `run_enhancement_field_loop`: 13 sequential calls (one per field) + `critique`. **Must not be
  altered.** Also the safety net when the other two fail to parse.

Selector: `COWORK_PROMPT_ENHANCER_STRATEGY` ∈ {`compiler`, `single_pass`, `field_loop`}.

This module was split per RFC-0025 Phase 2.3: prompt templates and field-ordering constants live in
`prompts.py`, the pure parsing/coercion/rendering functions in `coercion.py`, the three strategy
implementations in `strategies.py`. This file is left thin: `run_enhancement`'s orchestration
(shared fallback boundary, grounding/deep-research gathering) plus `build_specification`, the
compiler strategy's own renderer (kept here rather than in `coercion.py` because — unlike
`build_compiled_prompt` — it has exactly one caller, this module, so no import-cycle risk forces it
elsewhere).

Stdlib only here (`engine` is passed in as a duck-typed parameter); the module's only external
dependency is `ddgs`, isolated in `search.py` behind a lazy import (RFC-0020) — this file stays
importable without it."""
import os

from coercion import build_compiled_prompt, normalize_generated_prompt
from prompts import COMPILER_SECTIONS, INTENT_SPEC_FIELDS, PROMPT_SPEC_FIELDS
from search import gather_grounding, run_deep_research
from strategies import compile_intent, generate_full_spec, run_enhancement_field_loop


def build_specification(spec: dict) -> str:
    # Conversational head (RFC-0019, restoring RFC-0012 on the compiler path): the delivered prompt
    # opens with a second-person sentence + bridge line BEFORE `# Task`. Two purposes: a direct CTA
    # to the executing AI, and making the prompt read as written by a human (not a meta-template) so
    # a downstream AI doesn't mistake it for prompt injection. No echo of the raw prompt (RFC-0012/0018).
    lines = []
    directive = str(spec.get("directive", "")).strip()
    if directive:
        lines.extend([directive, "", "Use the specification below as your guide."])

    for header, field_name, is_list in COMPILER_SECTIONS:
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


def run_enhancement(engine, user_input: str, mode: str, think: bool = False, search: bool | None = None,
                    project_context: str = "", deep_research: bool = False) -> dict:
    # think: model reasoning. Default OFF (RFC-0013) — deterministic, no latency spikes; ON lets the
    # model reason (slower, more variable). The client chooses it via the terminal.
    # search: web grounding (RFC-0020). None ⇒ the gate decides (env COWORK_PROMPT_ENHANCER_SEARCH,
    # default `auto`: only searches on a freshness signal); True forces it; only the `compiler` path uses it.
    # project_context: real project files (RFC-0021, authoritative truth), empty for the general-purpose tool.
    # deep_research: opt-in multi-query research pass (RFC-0022) → also produces `research` (2nd output).
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
            # Deep research (RFC-0022): opt-in, multi-call (deliberately breaks RFC-0018's
            # single-call design). The synthesized report is the second output AND feeds the
            # compile step as evidence.
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
            # Same error boundary as single_pass: a parsing failure falls back to the validated
            # field-loop (no observable regression). The boundary is here, not inside compile_intent.
            spec = None
    elif strategy == "single_pass":
        try:
            spec = generate_full_spec(engine, user_input, mode, think=think)
            compiled_prompt = normalize_generated_prompt(build_compiled_prompt(spec))
            debug_fields = {field: spec[field] for field in PROMPT_SPEC_FIELDS}
            generation_mode = "single_pass_full_spec"
        except Exception:
            # Explicit fallback, silent to the user but tracked in debug: single_pass failed, the
            # request is still served via the validated historical path (no regression). The error
            # boundary is here, not inside generate_full_spec.
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
