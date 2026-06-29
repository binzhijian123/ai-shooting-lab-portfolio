#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-$ROOT/.venv-rag-finetune/bin/python}"
NODE="${NODE:-/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
MODEL="${MODEL:-/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit}"
DATA_DIR="${DATA_DIR:-$ROOT/data/finetune/shooting-deepseek-teacher-200}"
ADAPTER_PATH="${ADAPTER_PATH:-$ROOT/data/finetune/adapters/shooting-deepseek-teacher-v2}"
ITERS="${ITERS:-400}"

if [ ! -x "$PYTHON" ]; then
  echo "Missing MLX venv: $PYTHON"
  exit 1
fi

echo "=== Step 1: RAG build ==="
"$NODE" scripts/build-local-rag-index.mjs

echo "=== Step 2: Generate teacher dataset ==="
"$NODE" scripts/build-deepseek-teacher-200.mjs --count=200

echo "=== Step 3: Validate ==="
"$NODE" -e "
const train=require('fs').readFileSync('$DATA_DIR/train.jsonl','utf8').trim().split('\\n').filter(Boolean);
const valid=require('fs').readFileSync('$DATA_DIR/valid.jsonl','utf8').trim().split('\\n').filter(Boolean);
const test=require('fs').readFileSync('$DATA_DIR/test.jsonl','utf8').trim().split('\\n').filter(Boolean);
console.log(JSON.stringify({ok:train.length>=20, train:train.length, valid:valid.length, test:test.length}));
if (train.length < 20) process.exit(1);
"

echo "=== Step 4: LoRA training (400 iters) ==="
mkdir -p "$ADAPTER_PATH"
"$PYTHON" -m mlx_lm lora \
  --train \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_PATH" \
  --fine-tune-type lora \
  --mask-prompt \
  --num-layers 16 \
  --batch-size 4 \
  --grad-accumulation-steps 2 \
  --iters "$ITERS" \
  --learning-rate 3e-5 \
  --steps-per-report 20 \
  --steps-per-eval 40 \
  --val-batches 8 \
  --save-every 100 \
  --max-seq-length 4096 \
  --seed 42

echo "=== Step 5: Test evaluation ==="
"$PYTHON" -m mlx_lm lora \
  --test \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_PATH" \
  --test-batches -1 \
  --max-seq-length 4096

echo "=== Done ==="
echo "Adapter saved to: $ADAPTER_PATH"
