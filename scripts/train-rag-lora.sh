#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-$ROOT/.venv-rag-finetune/bin/python}"
NODE="${NODE:-/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
MODEL="${MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
DATA_DIR="${DATA_DIR:-$ROOT/data/finetune/shooting-rag-json}"
ADAPTER_PATH="${ADAPTER_PATH:-$ROOT/data/finetune/adapters/shooting-rag-json-lora}"
ITERS="${ITERS:-60}"
DATA_MAX="${DATA_MAX:-240}"
MIN_SFT_EXAMPLES="${MIN_SFT_EXAMPLES:-150}"
if [ "$DATA_MAX" -lt 150 ]; then
  MIN_SFT_EXAMPLES="$((DATA_MAX + 5))"
fi

if [ ! -x "$PYTHON" ]; then
  echo "Missing MLX venv: $PYTHON"
  echo "Run: python3 -m venv .venv-rag-finetune && .venv-rag-finetune/bin/python -m pip install mlx-lm"
  exit 1
fi

"$NODE" scripts/build-local-rag-index.mjs
"$NODE" scripts/build-rag-finetune-dataset.mjs --max="$DATA_MAX"
MIN_SFT_EXAMPLES="$MIN_SFT_EXAMPLES" "$NODE" scripts/rag-finetune-smoke.mjs

mkdir -p "$ADAPTER_PATH"

echo "Starting LoRA fine-tune"
echo "Model: $MODEL"
echo "Data: $DATA_DIR"
echo "Adapter: $ADAPTER_PATH"

"$PYTHON" -m mlx_lm lora \
  --train \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_PATH" \
  --fine-tune-type lora \
  --mask-prompt \
  --num-layers 8 \
  --batch-size 1 \
  --grad-accumulation-steps 4 \
  --iters "$ITERS" \
  --learning-rate 5e-5 \
  --steps-per-report 5 \
  --steps-per-eval 20 \
  --val-batches 4 \
  --save-every 20 \
  --max-seq-length 4096 \
  --seed 42

"$PYTHON" -m mlx_lm lora \
  --test \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_PATH" \
  --test-batches 4 \
  --max-seq-length 4096
