"""CLI del prompt enhancer — RFC-0005, RFC-0007, RFC-0010.
Ridotto dall'originale al solo percorso non-interattivo: nessuna REPL, nessun
prompt_toolkit, nessuna scrittura di debug_logs. Due modalità:
- single-shot (--prompt): un processo, una richiesta, un oggetto JSON su stdout, poi esce.
  Utile per diagnostica manuale (--health), non più usata da prompt-enhancer.ts.
- worker persistente (--serve): il modello si carica una sola volta, poi il processo resta
  vivo e serve richieste JSON-lines da stdin finché lo stdin non si chiude — RFC-0010.
  L'unico consumatore del worker è server/modules/prompt_enhancer/index.ts (nessun umano
  legge questo stdout): un oggetto JSON per riga in entrambe le direzioni, contratto
  macchina-a-macchina esplicito. I log del modello (llama.cpp, caricamento) vanno su
  stderr, separati dal risultato — invariato rispetto a RFC-0007."""

import argparse
import json
import sys
import threading

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
    """Legge una richiesta JSON per riga da stdin, risponde una riga JSON su stdout — RFC-0010/0014.
    **Concorrente** (RFC-0014): ogni richiesta è servita in un thread separato, così più richieste
    sono in volo insieme e llama-server le aggrega (continuous batching). L'`engine` è stateless
    (client HTTP + sampler read-only) → thread-safe; la scrittura su stdout è protetta da un lock
    così le righe JSON non si intrecciano. Il TS correla le risposte per `id` (arrivano fuori ordine).
    Un errore su una singola richiesta non termina il worker: risponde con `error` e continua."""
    print("Worker pronto (client HTTP verso llama-server).", file=sys.stderr, flush=True)
    stdout_lock = threading.Lock()

    def handle(raw_line: str) -> None:
        request_id = None
        try:
            request = json.loads(raw_line)
            request_id = request.get("id")
            result = run_enhancement(
                engine=engine,
                user_input=request["prompt"],
                mode=request.get("mode", "production-grade"),
                think=bool(request.get("think", False)),
                # `search` assente ⇒ None ⇒ decide il gate (RFC-0020); True/False forza esplicitamente.
                search=request.get("search"),
                # `project_context` (RFC-0021): file reali del progetto; vuoto per il tool generale.
                project_context=str(request.get("project_context", "") or ""),
                # `deep_research` (RFC-0022): opt-in, produce anche `research` (2° output).
                deep_research=bool(request.get("deep_research", False)),
            )
            response = {"id": request_id, "prompt": result["compiled_prompt"], "research": result.get("research", "")}
        except Exception as exc:  # noqa: BLE001 - confine di processo: una richiesta guasta non deve uccidere il worker.
            response = {"id": request_id, "error": str(exc)}

        with stdout_lock:
            print(json.dumps(response, ensure_ascii=True), flush=True)

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        threading.Thread(target=handle, args=(raw_line,), daemon=True).start()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cowork Prompt Enhancer (lean)")
    parser.add_argument("--prompt", type=str, help="Prompt da potenziare (modalità single-shot)")
    parser.add_argument("--mode", type=str, default="production-grade", help="Modalità di enhancement")
    parser.add_argument("--spec-only", action="store_true", help="Stampa solo il prompt_spec JSON")
    parser.add_argument("--health", action="store_true", help="Stampa lo stato del backend ed esce")
    parser.add_argument(
        "--serve", action="store_true", help="Avvia il worker persistente (JSON-lines su stdin/stdout) — RFC-0010"
    )
    parser.add_argument(
        "--think", action="store_true", help="Abilita il reasoning del modello (default off) — RFC-0013"
    )
    # store_const con default None: assente ⇒ decide il gate (env COWORK_PROMPT_ENHANCER_SEARCH); presente ⇒ forza — RFC-0020.
    parser.add_argument(
        "--search",
        dest="search",
        action="store_const",
        const=True,
        default=None,
        help="Forza il grounding web (DuckDuckGo) per questa richiesta — RFC-0020",
    )
    parser.add_argument(
        "--deep-research",
        dest="deep_research",
        action="store_true",
        help="Passaggio di ricerca multi-query + report separato (opt-in, lento) — RFC-0022",
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
        raise SystemExit("--prompt è obbligatorio in modalità single-shot")

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
