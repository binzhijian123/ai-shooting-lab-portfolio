#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-$ROOT/.venv-rag-finetune/bin/python}"
MODEL="${MODEL:-/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit}"
ADAPTER="${ADAPTER:-$ROOT/data/finetune/adapters/shooting-vector-rag-augmented-v1}"
NODE="${NODE:-/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
TOP_K="${TOP_K:-5}"

QUESTION="${1:-}"
if [ -z "$QUESTION" ]; then
  echo "Usage: $0 \"你的投篮问题\""
  exit 1
fi

RAG_RESULT=$("$NODE" scripts/vector-rag-query.mjs "$QUESTION" 2>/dev/null)

SLUGS=$(echo "$RAG_RESULT" | "$PYTHON" -c "
import sys, json
d = json.load(sys.stdin)
for m in d['retrieval']['matches']:
    print(m['slug'])
" 2>/dev/null || echo "")

if [ -z "$SLUGS" ]; then
  if echo "$QUESTION" | grep -qiE "(我的|诊断|帮我看看|帮我分析|你觉得我|适合我吗|我应该怎么改|帮我查|你看我)"; then
    echo '{"answer":"个人视频或个人动作的最终诊断需要教练结合视频证据确认。这里可以解释通用训练知识、拍摄要求或知识库里的训练概念。","cited_slugs":[],"confidence":"low","boundary":"personal_diagnosis_refusal"}'
  else
    echo '{"answer":"当前知识库没有直接相关依据","cited_slugs":[],"confidence":"low","boundary":"knowledge_insufficient"}'
  fi
  exit 0
fi

PROMPT=$(cat << PROMPT_EOF
问题：$QUESTION
RAG 知识卡：
$(echo "$RAG_RESULT" | "$PYTHON" -c "
import sys, json
d = json.load(sys.stdin)
cards = []
for m in d['retrieval']['matches'][:3]:
    cards.append({
        'slug': m['slug'],
        'title': m['title'],
        'summary': m['summary'],
        'diagnosis_rules': m.get('diagnosis_rules', []),
        'repair_actions': m.get('repair_actions', [])
    })
print(json.dumps(cards, ensure_ascii=False, indent=2))
")
请只依据这些知识卡输出 JSON。
PROMPT_EOF
)

echo "$PROMPT" | "$PYTHON" -m mlx_lm generate \
  --model "$MODEL" \
  --adapter-path "$ADAPTER" \
  --prompt - \
  --max-tokens 350 \
  --temp 0 \
  --use-default-chat-template \
  --system-prompt "你是 AI 投篮实验室的本地小模型知识助手。只能依据用户提供的 RAG 知识卡回答。必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。cited_slugs 必须来自 RAG 知识卡。boundary 只能是 general_training_only、personal_diagnosis_refusal、knowledge_insufficient。"
