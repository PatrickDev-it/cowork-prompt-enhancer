"""Tests for the pure parsing/coercion/classification/rendering functions behind the prompt
enhancer's three generation strategies.

These functions absorb an LLM's unpredictable output (mixed JSON, missing fields, wrong types) and
are the highest-risk, zero-external-dependency code in the compiler — see RFC-0025 Phase 1.1. They
take plain values in and return plain values out, so they are tested directly with no mocking and
no model involved.

Written against `workflow.py` when it was a single 915-line file; RFC-0025 Phase 2.3 later split
that file into `prompts.py` / `coercion.py` / `strategies.py` / a thinned `workflow.py`. This suite
was the safety net for that split — it stayed green throughout with only these import lines
changed, verifying the refactor by test, not by re-reading.
"""
from coercion import (
    build_compiled_prompt,
    coerce_value_from_raw,
    extract_json_objects,
    extract_value_from_mixed_output,
    field_fallback,
    normalize_field_value,
    normalize_generated_prompt,
)
from strategies import classify_target
from workflow import build_specification

# --- normalize_generated_prompt --------------------------------------------------------------


def test_normalize_generated_prompt_empty_input_returns_unchanged():
    assert normalize_generated_prompt("") == ""
    assert normalize_generated_prompt("   \n  ") == ""
    assert normalize_generated_prompt(None) == ""


def test_normalize_generated_prompt_strips_leading_preamble_line():
    assert normalize_generated_prompt("Here is the result:\nHello world") == "Hello world"
    assert normalize_generated_prompt("ecco il risultato\nCiao mondo") == "Ciao mondo"


def test_normalize_generated_prompt_strips_code_fence():
    assert normalize_generated_prompt("```json\n{\"a\": 1}\n```") == '{"a": 1}'
    assert normalize_generated_prompt("```\nplain\n```") == "plain"


def test_normalize_generated_prompt_leaves_plain_text_untouched():
    assert normalize_generated_prompt("  Just a plain sentence.  ") == "Just a plain sentence."


# --- extract_json_objects ---------------------------------------------------------------------


def test_extract_json_objects_returns_empty_list_for_no_json():
    assert extract_json_objects("") == []
    assert extract_json_objects("just plain text, no braces at all") == []


def test_extract_json_objects_pulls_multiple_objects_from_noisy_text():
    text = 'Sure, here is the value: {"a": 1} and then also {"b": 2} — done.'
    assert extract_json_objects(text) == [{"a": 1}, {"b": 2}]


def test_extract_json_objects_skips_malformed_braces_and_keeps_valid_ones():
    text = '{"a": 1} {this is not json} {"b": 2}'
    assert extract_json_objects(text) == [{"a": 1}, {"b": 2}]


# --- extract_value_from_mixed_output --------------------------------------------------------


def test_extract_value_from_mixed_output_prefers_last_value_block():
    raw = '{"value": "first draft"} some commentary {"value": "final answer"}'
    assert extract_value_from_mixed_output("role", raw) == "final answer"


def test_extract_value_from_mixed_output_falls_back_to_target_field_block():
    raw = 'The model answered: {"role": "Senior Backend Engineer"}'
    assert extract_value_from_mixed_output("role", raw) == "Senior Backend Engineer"


def test_extract_value_from_mixed_output_returns_none_when_neither_present():
    assert extract_value_from_mixed_output("role", "no json at all here") is None
    assert extract_value_from_mixed_output("role", '{"other": "x"}') is None


# --- coerce_value_from_raw --------------------------------------------------------------------


def test_coerce_value_from_raw_extracts_bulleted_list_for_list_field():
    raw = "- step one\n* step two\n1. step three"
    result = coerce_value_from_raw("execution_steps", raw, "build a thing", "standard")
    assert result == ["step one", "step two", "step three"]


def test_coerce_value_from_raw_list_field_keeps_unbulleted_line_as_single_item():
    # The bullet-stripping regex only strips a leading marker when one is present; a plain line
    # with no marker still counts as one item rather than being discarded.
    result = coerce_value_from_raw("constraints", "no bullets in this line at all", "task", "standard")
    assert result == ["no bullets in this line at all"]


def test_coerce_value_from_raw_list_field_falls_back_when_input_is_blank():
    result = coerce_value_from_raw("constraints", "   ", "task", "standard")
    assert result == field_fallback("constraints", "task", "standard")


def test_coerce_value_from_raw_parses_output_format_json():
    raw = '{"type": "markdown", "structure": ["intro", "body"]}'
    result = coerce_value_from_raw("output_format", raw, "task", "standard")
    assert result == {"type": "markdown", "structure": ["intro", "body"]}


def test_coerce_value_from_raw_output_format_falls_back_on_invalid_json():
    result = coerce_value_from_raw("output_format", "not json at all", "task", "standard")
    assert result == field_fallback("output_format", "task", "standard")


def test_coerce_value_from_raw_strips_boilerplate_from_scalar_field():
    raw = "Do not include any text outside the JSON.\nSenior Backend Engineer"
    result = coerce_value_from_raw("role", raw, "task", "standard")
    assert result == "Senior Backend Engineer"


def test_coerce_value_from_raw_empty_input_falls_back():
    result = coerce_value_from_raw("role", "   ", "generic task", "standard")
    assert result == field_fallback("role", "generic task", "standard")


# --- normalize_field_value --------------------------------------------------------------------


def test_normalize_field_value_rejects_non_list_for_list_field():
    result = normalize_field_value("constraints", "not actually a list", "task", "standard")
    assert result == field_fallback("constraints", "task", "standard")


def test_normalize_field_value_strips_and_drops_blank_list_items():
    result = normalize_field_value("constraints", ["  keep this  ", "  ", ""], "task", "standard")
    assert result == ["keep this"]


def test_normalize_field_value_list_field_falls_back_when_all_items_blank():
    result = normalize_field_value("constraints", ["   ", ""], "task", "standard")
    assert result == field_fallback("constraints", "task", "standard")


def test_normalize_field_value_rejects_non_dict_output_format():
    result = normalize_field_value("output_format", "nope", "task", "standard")
    assert result == field_fallback("output_format", "task", "standard")


def test_normalize_field_value_output_format_defaults_missing_structure():
    result = normalize_field_value("output_format", {"type": "markdown"}, "task", "standard")
    assert result == {
        "type": "markdown",
        "structure": field_fallback("output_format", "task", "standard")["structure"],
    }


def test_normalize_field_value_output_format_defaults_blank_type_to_markdown():
    result = normalize_field_value("output_format", {"type": "", "structure": ["a"]}, "task", "standard")
    assert result == {"type": "markdown", "structure": ["a"]}


def test_normalize_field_value_scalar_field_strips_whitespace():
    assert normalize_field_value("role", "  Senior Engineer  ", "task", "standard") == "Senior Engineer"


def test_normalize_field_value_scalar_field_falls_back_when_blank():
    result = normalize_field_value("role", "   ", "generic task description", "standard")
    assert result == field_fallback("role", "generic task description", "standard")


# --- classify_target -------------------------------------------------------------------------


def test_classify_target_detects_english_technical_signal():
    assert classify_target("Build a REST API for user management") == "technical"


def test_classify_target_detects_italian_technical_signal():
    assert classify_target("Crea una dashboard per il monitoraggio") == "technical"


def test_classify_target_defaults_to_conversational():
    assert classify_target("What's your favorite color?") == "conversational"
    assert classify_target("") == "conversational"
    assert classify_target(None) == "conversational"


# --- build_specification / build_compiled_prompt ----------------------------------------------


def test_build_specification_omits_empty_sections():
    spec = {"task": "Implement login", "directive": ""}
    result = build_specification(spec)
    assert result == "# Task\nImplement login"
    assert "# Context" not in result
    assert "# Known Requirements" not in result


def test_build_specification_renders_directive_head_when_present():
    spec = {"directive": "Implement the login flow.", "task": "Implement login"}
    result = build_specification(spec)
    assert result.startswith("Implement the login flow.\n\nUse the specification below as your guide.")


def test_build_compiled_prompt_falls_back_when_directive_blank():
    result = build_compiled_prompt({})
    assert result.startswith(
        "Complete the task described below and deliver a complete, production-ready result."
    )


def test_build_compiled_prompt_renders_provided_directive():
    spec = {"directive": "Fix the failing test.", "execution_steps": ["Read the stack trace."]}
    result = build_compiled_prompt(spec)
    assert result.startswith("Fix the failing test.")
    assert "- Read the stack trace." in result
