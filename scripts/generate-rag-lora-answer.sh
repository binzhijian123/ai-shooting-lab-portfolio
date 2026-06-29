#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-$ROOT/.venv-rag-finetune/bin/python}"
NODE="${NODE:-/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
MODEL="${MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
ADAPTER_PATH="${ADAPTER_PATH:-$ROOT/data/finetune/adapters/shooting-rag-json-lora}"
QUESTION="${*:-低位到高位起球怎么做？}"
PROMPT_PATH="$ROOT/data/finetune/shooting-rag-json/latest_prompt.txt"

"$NODE" scripts/prepare-rag-lora-prompt.mjs "$QUESTION"

if [ ! -d "$ADAPTER_PATH" ]; then
  echo "Adapter path not found: $ADAPTER_PATH"
  echo "Run scripts/train-rag-lora.sh first, or set ADAPTER_PATH to an existing adapter."
  exit 1
fi

cat "$PROMPT_PATH" | "$PYTHON" -m mlx_lm generate \
  --model "$MODEL" \
  --adapter-path "$ADAPTER_PATH" \
  --prompt - \
  --max-tokens 512 \
  --temp 0 \
  --verbose false
