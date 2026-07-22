"""Single-shot and persistent JSON-lines CLI for every provider profile (RFC-0010, RFC-0026)."""

import argparse
import json
import os
import sys
import threading
import time

from correlation import reset_correlation_id, set_correlation_id
from engine import LLMEngine, resolve_model_id
from workflow import run_enhancement


def run_once(
    engine: LLMEngine,
    prompt: str,
    mode: str,
    spec_only: bool,
    think: bool = False,
    search: bool | None = None,
    deep_research: bool = False,
) -> None:
    result = run_enhancement(
        engine=engine, user_input=prompt, mode=mode, think=think, search=search, deep_research=deep_research
    )

    if spec_only:
        print(json.dumps({"prompt_spec": result["prompt_spec"]}, ensure_ascii=True))
        return

    print(json.dumps({"prompt": result["compiled_prompt"], "research": result.get("research", "")}, ensure_ascii=True))


def run_serve(engine: LLMEngine) -> None:
    """Serve concurrent JSON-lines requests without letting one failure terminate the worker."""

    print(f"Worker ready ({engine.backend} provider).", file=sys.stderr, flush=True)
    stdout_lock = threading.Lock()

    def handle(raw_line: str) -> None:
        request_id = None
        correlation_token = None
        try:
            request = json.loads(raw_line)
            request_id = request.get("id")
            correlation_token = set_correlation_id(str(request_id or ""))
            engine.reset_metrics()
            started = time.perf_counter()
            result = run_enhancement(
                engine=engine,
                user_input=request["prompt"],
                mode=request.get("mode", "production-grade"),
                think=bool(request.get("think", False)),
                search=request.get("search"),
                project_context=str(request.get("project_context", "") or ""),
                deep_research=bool(request.get("deep_research", False)),
            )
            calls = engine.snapshot_metrics()
            generation_mode = str(result["debug"]["generation_mode"])
            requested_strategy = os.getenv("COWORK_PROMPT_ENHANCER_STRATEGY", "compiler").strip().lower()
            fallback_used = requested_strategy in {"compiler", "single_pass"} and generation_mode == (
                "single_generic_prompt_template"
            )
            response = {
                "id": request_id,
                "prompt": result["compiled_prompt"],
                "research": result.get("research", ""),
                "trace": {
                    "generationMs": round((time.perf_counter() - started) * 1000, 3),
                    "providerMs": round(sum(float(call["generation_ms"]) for call in calls), 3),
                    "providerCalls": len(calls),
                    "promptTokens": sum(int(call["prompt_tokens"]) for call in calls),
                    "completionTokens": sum(int(call["completion_tokens"]) for call in calls),
                    "generationMode": generation_mode,
                    "fallbackUsed": fallback_used,
                    "grounded": bool(result["debug"]["grounded"]),
                },
            }
        except Exception as exc:  # noqa: BLE001 - process boundary: one bad request must not kill the worker.
            response = {"id": request_id, "error": str(exc), "error_code": getattr(exc, "code", "internal_error")}
        finally:
            if correlation_token is not None:
                reset_correlation_id(correlation_token)

        with stdout_lock:
            print(json.dumps(response, ensure_ascii=True), flush=True)

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        threading.Thread(target=handle, args=(raw_line,), daemon=True).start()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cowork Prompt Enhancer")
    parser.add_argument("--prompt", type=str, help="Request to compile in single-shot mode")
    parser.add_argument("--mode", type=str, default="production-grade", help="Enhancement mode")
    parser.add_argument("--spec-only", action="store_true", help="Print only the prompt specification JSON")
    parser.add_argument("--health", action="store_true", help="Print provider health and exit")
    parser.add_argument("--serve", action="store_true", help="Start the persistent JSON-lines worker")
    parser.add_argument("--think", action="store_true", help="Enable provider reasoning when supported")
    parser.add_argument(
        "--search",
        dest="search",
        action="store_const",
        const=True,
        default=None,
        help="Force web grounding for this request",
    )
    parser.add_argument(
        "--deep-research",
        dest="deep_research",
        action="store_true",
        help="Run opt-in multi-query research and return a separate report",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()

    engine = LLMEngine(model_id=resolve_model_id())

    if args.health:
        print(json.dumps({"status": "ok", "gpu": engine.gpu_info()}, indent=2, ensure_ascii=True))
        return

    if args.serve:
        run_serve(engine)
        return

    if not args.prompt:
        raise SystemExit("--prompt is required in single-shot mode")

    run_once(
        engine=engine,
        prompt=args.prompt,
        mode=args.mode,
        spec_only=args.spec_only,
        think=args.think,
        search=args.search,
        deep_research=args.deep_research,
    )


if __name__ == "__main__":
    main()
