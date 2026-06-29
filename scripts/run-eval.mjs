import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EVAL_PATH = path.join(ROOT, "data", "eval", "rag_lora_eval_set.json");
const API_PORT = Number(process.env.API_PORT || 4175);
const API_HOST = process.env.API_HOST || "127.0.0.1";

async function callAPI(question, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ question });
    const req = http.request({
      hostname: API_HOST, port: API_PORT, path: "/api/local-rag-coach", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout
    }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message} | body: ${body.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

async function main() {
  const raw = await readFile(EVAL_PATH, "utf8");
  const { questions } = JSON.parse(raw);

  console.log(`=== RAG + LoRA 评估 ===`);
  console.log(`API: http://${API_HOST}:${API_PORT}`);
  console.log(`Questions: ${questions.length}\n`);

  const results = [];
  let passed = 0;

  for (const q of questions) {
    process.stdout.write(`[${q.id}] ${q.question.slice(0, 35)}... `);
    try {
      const resp = await callAPI(q.question);
      const a = resp.answer || {};
      const failures = [];

      if (!resp.ok) failures.push("ok=false");
      if (q.expected_boundary && a.boundary && a.boundary !== q.expected_boundary)
        failures.push(`boundary=${a.boundary} (expected=${q.expected_boundary})`);

      const slugs = Array.isArray(a.cited_slugs) ? a.cited_slugs : [];
      if (q.min_cited_slugs > 0 && slugs.length < q.min_cited_slugs)
        failures.push(`slugs=${slugs.length} (min=${q.min_cited_slugs})`);

      const retSlugs = new Set((resp.retrieval?.matches || []).map((m) => m.slug));
      const invalidSlugs = slugs.filter((s) => !retSlugs.has(s));
      if (invalidSlugs.length) failures.push(`invalid_slugs=${invalidSlugs.join(",")}`);

      if (!a.answer || a.answer.trim().length < 5) failures.push("empty_answer");
      if (!["high", "medium", "low"].includes(a.confidence))
        failures.push(`bad_confidence=${a.confidence}`);
      if (!["general_training_only", "personal_diagnosis_refusal", "knowledge_insufficient"].includes(a.boundary))
        failures.push(`bad_boundary=${a.boundary}`);

      const ok = failures.length === 0;
      if (ok) { passed++; console.log(`OK (conf=${a.confidence}, bound=${a.boundary}, slugs=${slugs.length})`); }
      else { console.log(`FAIL: ${failures.join("; ")}`); }

      results.push({
        id: q.id, question: q.question, category: q.category,
        boundary: a.boundary, confidence: a.confidence,
        cited_slugs: slugs, model_source: resp.model_source,
        ok, failures
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ id: q.id, question: q.question, category: q.category, error: err.message, ok: false });
    }
  }

  console.log(`\n=== 评估结果 ===`);
  console.log(`通过: ${passed}/${questions.length} (${(passed / questions.length * 100).toFixed(1)}%)`);

  const cats = {};
  for (const r of results) {
    if (!cats[r.category]) cats[r.category] = { total: 0, passed: 0 };
    cats[r.category].total++;
    if (r.ok) cats[r.category].passed++;
  }
  for (const [cat, s] of Object.entries(cats))
    console.log(`  ${cat}: ${s.passed}/${s.total} (${(s.passed / s.total * 100).toFixed(1)}%)`);

  const outputPath = path.join(ROOT, "data", "eval", "eval_results.json");
  await writeFile(outputPath, JSON.stringify({
    schema_version: "rag_lora_eval_results.v1",
    generated_at: new Date().toISOString(),
    summary: { total: questions.length, passed, rate: passed / questions.length },
    categories: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { ...v, rate: v.passed / v.total }])),
    results
  }, null, 2));
  console.log(`\n结果已保存: ${outputPath}`);
}

main().catch(console.error);
