#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE="${NODE:-/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
API="${API:-http://localhost:4173}"
EVAL_SET="data/eval/rag_lora_eval_set.json"

echo "=== RAG + LoRA 评估 ==="
echo "API: $API"
echo "Eval set: $EVAL_SET"
echo ""

TOTAL=0
PASSED=0
RESULTS_FILE="data/eval/eval_auto_results.json"

# Build results array in Node
RESULTS='[]'

# Read eval set and iterate
QUESTIONS=$($NODE -e "
const fs = require('fs');
const set = JSON.parse(fs.readFileSync('$EVAL_SET', 'utf8'));
for (const q of set.questions) {
  console.log(JSON.stringify({id: q.id, question: q.question, category: q.category, expected_boundary: q.expected_boundary, min_cited_slugs: q.min_cited_slugs}));
}
")

echo "$QUESTIONS" | while read -r QJSON; do
  ID=$(echo "$QJSON" | $NODE -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)")
  QUESTION=$(echo "$QJSON" | $NODE -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).question)")
  CATEGORY=$(echo "$QJSON" | $NODE -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).category)")
  EXPECTED=$(echo "$QJSON" | $NODE -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).expected_boundary)")
  MIN_SLUGS=$(echo "$QJSON" | $NODE -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).min_cited_slugs))")

  TOTAL=$((TOTAL + 1))

  printf "[%s] %s... " "$ID" "$(echo "$QUESTION" | head -c 40)"

  # Call API
  RESPONSE=$(curl -m 120 -s -X POST "$API/api/local-rag-coach" \
    -H "Content-Type: application/json" \
    -d "$(echo "{\"question\":$(echo "$QUESTION" | $NODE -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))")}")" 2>/dev/null)

  if [ $? -ne 0 ] || [ -z "$RESPONSE" ]; then
    echo "❌ API failed"
    continue
  fi

  # Check JSON
  echo "$RESPONSE" | $NODE -e "
    const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const q = JSON.parse(process.argv[1]);
    const failures = [];

    if (!r.ok) { failures.push('response.ok is false'); }
    const a = r.answer || {};
    if (a.boundary && q.expected_boundary && a.boundary !== q.expected_boundary) {
      failures.push('boundary: expected ' + q.expected_boundary + ', got ' + a.boundary);
    }
    const slugs = Array.isArray(a.cited_slugs) ? a.cited_slugs : [];
    if (q.min_cited_slugs > 0 && slugs.length < q.min_cited_slugs) {
      failures.push('cited_slugs: expected >= ' + q.min_cited_slugs + ', got ' + slugs.length);
    }
    const retSlugs = new Set((r.retrieval?.matches || []).map(m => m.slug));
    const invalid = slugs.filter(s => !retSlugs.has(s));
    if (invalid.length > 0) {
      failures.push('invalid slugs: ' + invalid.join(','));
    }
    if (!a.answer || a.answer.trim().length < 5) {
      failures.push('answer too short');
    }

    if (failures.length === 0) {
      process.stdout.write('✅\\n');
    } else {
      process.stdout.write('❌\\n');
      for (const f of failures) {
        process.stdout.write('    - ' + f + '\\n');
      }
    }
  " "$QJSON" 2>/dev/null || echo "❌ Parse error"

  sleep 1
done

echo ""
echo "Done. Check data/eval/eval_auto_results.json for full output."
