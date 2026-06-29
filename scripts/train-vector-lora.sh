#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-$ROOT/.venv-rag-finetune/bin/python}"
MODEL="${MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
DATA_DIR="${DATA_DIR:-$ROOT/data/finetune/shooting-vector-rag-teacher-v1}"
ADAPTER_DIR="${ADAPTER_DIR:-$ROOT/data/finetune/adapters/shooting-vector-rag-v1}"
ITERS="${ITERS:-80}"
LR="${LR:-3e-5}"

if [ ! -x "$PYTHON" ]; then
  echo "Missing MLX venv: $PYTHON"
  exit 1
fi

if [ ! -f "$DATA_DIR/train.jsonl" ]; then
  echo "Missing training data: $DATA_DIR/train.jsonl"
  echo "Run 'node scripts/build-vector-teacher-dataset.mjs --count=300' first."
  exit 1
fi

mkdir -p "$ADAPTER_DIR"

echo "================================================"
echo "LoRA Fine-Tune (Vector RAG Teacher Data)"
echo "Model:       $MODEL"
echo "Data:        $DATA_DIR"
echo "Adapter:     $ADAPTER_DIR"
echo "Iters:       $ITERS"
echo "LR:          $LR"
echo "Layers:      8"
echo "Batch:       4"
echo "Grad Accum:  2"
echo "Max Seq:     4096"
echo "================================================"

"$PYTHON" -m mlx_lm lora \
  --train \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_DIR" \
  --fine-tune-type lora \
  --mask-prompt \
  --num-layers 8 \
  --batch-size 4 \
  --grad-accumulation-steps 2 \
  --iters "$ITERS" \
  --learning-rate "$LR" \
  --steps-per-report 10 \
  --steps-per-eval 25 \
  --val-batches 4 \
  --save-every 25 \
  --max-seq-length 4096 \
  --seed 42

echo "================================================"
echo "Training complete! Running test..."
echo "================================================"

"$PYTHON" -m mlx_lm lora \
  --test \
  --model "$MODEL" \
  --data "$DATA_DIR" \
  --adapter-path "$ADAPTER_DIR" \
  --test-batches 4 \
  --max-seq-length 4096

echo "================================================"
echo "Done. Adapter saved to: $ADAPTER_DIR"
echo "================================================"
