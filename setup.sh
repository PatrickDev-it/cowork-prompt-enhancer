#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
bun run install:frozen

if [[ "${1:-}" != "--local" ]]; then
  echo "Mock profile installed. Run: bun run preflight; bun run demo:mock"
  exit 0
fi

TEMP="$ROOT/src/server/.setup"
BIN="$ROOT/src/server/bin"
MODELS="$ROOT/src/server/models"
mkdir -p "$TEMP" "$BIN" "$MODELS"

ARCHIVE="$TEMP/llama-b9893-bin-ubuntu-x64.tar.gz"
if [[ ! -x "$BIN/llama-server" || "${2:-}" == "--force" ]]; then
  curl --fail --location --output "$ARCHIVE" \
    "https://github.com/ggml-org/llama.cpp/releases/download/b9893/llama-b9893-bin-ubuntu-x64.tar.gz"
  echo "4eed74472fc50b6406e67b04c815f3ea78849831424f72452db1c3245a7da8fb  $ARCHIVE" | sha256sum --check --status
  tar --extract --gzip --file "$ARCHIVE" --directory "$BIN" --strip-components=1
fi

MODEL="$MODELS/Qwen3-8B-Q4_K_M.gguf"
if [[ ! -f "$MODEL" || "${2:-}" == "--force" ]]; then
  curl --fail --location --output "$MODEL" \
    "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf"
  echo "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785  $MODEL" | sha256sum --check --status
fi

COWORK_PROFILE=local bun run preflight
