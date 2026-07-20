# Decisions

Semantic memory: one line per decision — the reasoning that must survive, not the diff.
Format: `- YYYY-MM-DD: chose X over Y because Z`. Consult before re-opening a settled choice.
Big, irreversible architectural decisions belong in `adr/` instead.

- 2026-07-20: placed `build_compiled_prompt` in `prompt_enhancer/coercion.py` instead of
  `workflow.py` (RFC-0025 Phase 2.3 said workflow.py) because it's called both from
  `strategies.run_enhancement_field_loop` and from `workflow.run_enhancement`'s single_pass branch
  — putting it in either of those two (which already have a workflow.py → strategies.py import
  edge) would create a circular import. `run_enhancement_field_loop` must not be altered (RFC-0005
  § crit. 4), so the function that moves is the pure renderer, not the untouchable strategy.
