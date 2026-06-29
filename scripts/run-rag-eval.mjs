/**
 * RAG + LoRA 评估脚本
 * 
 * 对固定评估集逐个提问，检查：
 * 1. JSON 是否合法
 * 2. cited_slugs 是否来自 RAG top-k
 * 3. boundary 是否符合预期
 * 4. 个人诊断是否拒答
 * 5. 无关问题是否说无依据
 * 
 * 用法：
 *   node scripts/run-rag-eval.mjs
 *   node scripts/run-rag-eval.mjs --api=http://localhost:4173
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
const API_BASE = args.api || "http://localhost:4173";
const EVAL_SET_PATH = path.join(ROOT, "data", "eval", "rag_lora_eval_set.json");

async function main() {
  const evalSetRaw = await readFile(EVAL_SET_PATH, "utf8");
  const evalSet = JSON.parse(evalSetRaw);
  const questions = evalSet.questions;

  console.log(`=== RAG + LoRA 评估 ===`);
  console.log(`Eval set: ${questions.length} questions`);
  console.log(`API: ${API_BASE}`);
  console.log("");

  const results = [];
  let passedCount = 0;

  for (const q of questions) {
    process.stdout.write(`[${q.id}] ${q.question.slice(0, 40)}... `);

    try {
      const response = await callAPI(API_BASE, q.question);
      const result = evaluateResponse(q, response);
      results.push(result);

      if (result.allPassed) {
        passedCount++;
        console.log(`✅`);
      } else {
        console.log(`❌`);
        for (const failure of result.failures) {
          console.log(`    - ${failure}`);
        }
      }
    } catch (err) {
      console.log(`💥 API Error: ${err.message}`);
      results.push({
        id: q.id,
        question: q.question,
        category: q.category,
        error: err.message,
        allPassed: false,
        failures: [`API error: ${err.message}`]
      });
    }
  }

  // Summary
  console.log("\n=== 评估结果 ===");
  console.log(`通过: ${passedCount}/${questions.length}`);
  console.log(`通过率: ${(passedCount / questions.length * 100).toFixed(1)}%`);

  // Per-category
  const categories = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = { total: 0, passed: 0 };
    categories[r.category].total++;
    if (r.allPassed) categories[r.category].passed++;
  }

  console.log("\n分类统计:");
  for (const [cat, stats] of Object.entries(categories)) {
    console.log(`  ${cat}: ${stats.passed}/${stats.total} (${(stats.passed / stats.total * 100).toFixed(1)}%)`);
  }

  // Save results
  const outputPath = path.join(ROOT, "data", "eval", "eval_results.json");
  await writeFile(outputPath, JSON.stringify({
    schema_version: "rag_lora_eval_results.v1",
    generated_at: new Date().toISOString(),
    summary: {
      total: questions.length,
      passed: passedCount,
      pass_rate: passedCount / questions.length
    },
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, { ...v, rate: v.passed / v.total }])),
    results
  }, null, 2), "utf8");
  console.log(`\n结果已保存: ${outputPath}`);
}

function evaluateResponse(q, response) {
  const failures = [];

  // 1. Check response structure
  if (!response.ok) {
    failures.push(`response.ok is false: ${response.error || "unknown"}`);
    return { id: q.id, question: q.question, category: q.category, allPassed: false, failures };
  }

  const answer = response.answer;
  if (!answer) {
    failures.push("missing answer field");
    return { id: q.id, question: q.question, category: q.category, allPassed: false, failures };
  }

  // 2. Check boundary
  if (q.expected_boundary && answer.boundary !== q.expected_boundary) {
    failures.push(`boundary: expected "${q.expected_boundary}", got "${answer.boundary}"`);
  }

  // 3. Check cited_slugs
  const slugs = Array.isArray(answer.cited_slugs) ? answer.cited_slugs : [];
  if (q.min_cited_slugs > 0 && slugs.length < q.min_cited_slugs) {
    failures.push(`cited_slugs: expected >= ${q.min_cited_slugs}, got ${slugs.length}`);
  }

  // 4. Check all cited_slugs are from retrieval
  const retrievedSlugs = new Set((response.retrieval?.matches || []).map(m => m.slug));
  const invalidSlugs = slugs.filter(s => !retrievedSlugs.has(s));
  if (invalidSlugs.length > 0) {
    failures.push(`cited_slugs contains slugs not in retrieval: ${invalidSlugs.join(", ")}`);
  }

  // 5. Check answer is not empty
  if (!answer.answer || answer.answer.trim().length < 5) {
    failures.push("answer text is empty or too short");
  }

  return {
    id: q.id,
    question: q.question,
    category: q.category,
    boundary: answer.boundary,
    answer_length: (answer.answer || "").length,
    cited_count: slugs.length,
    allPassed: failures.length === 0,
    failures
  };
}

function callAPI(baseUrl, question) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/local-rag-coach", baseUrl);
    const data = JSON.stringify({ question });

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      },
      timeout: 120000
    }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(data);
    req.end();
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg.startsWith("--api=")) parsed.api = arg.slice("--api=".length);
  }
  return parsed;
}

main().catch(console.error);
