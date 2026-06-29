import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveLocalRag } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const index = JSON.parse(await readFile(path.join(root, "data", "rag", "local_rag_index.json"), "utf8"));
const evalSet = JSON.parse(await readFile(path.join(root, "data", "rag", "rag_eval_questions.json"), "utf8"));
const topK = Number(process.argv.find((arg) => arg.startsWith("--topK="))?.slice("--topK=".length) || 5);
const showDetails = process.argv.includes("--details");

const rows = evalSet.questions.map((item) => evaluateQuestion(item, index, { topK }));
const inDomainRows = rows.filter((row) => row.expected_behavior !== "should_not_retrieve_confident_training_answer");
const outOfDomainRows = rows.filter((row) => row.expected_behavior === "should_not_retrieve_confident_training_answer");

const report = {
  ok: true,
  schema_version: "rag_retrieval_eval_report.v1",
  source_contract: "human_reviewable_seed_eval_not_final_benchmark",
  eval_file: "data/rag/rag_eval_questions.json",
  index_chunks: index.chunk_count,
  question_count: rows.length,
  metrics: {
    hit_at_1: ratio(inDomainRows.filter((row) => row.hit_at_1).length, inDomainRows.length),
    hit_at_3: ratio(inDomainRows.filter((row) => row.hit_at_3).length, inDomainRows.length),
    hit_at_5: ratio(inDomainRows.filter((row) => row.hit_at_5).length, inDomainRows.length),
    out_of_domain_low_confidence_rate: ratio(outOfDomainRows.filter((row) => row.out_of_domain_low_confidence).length, outOfDomainRows.length)
  },
  review_notes: [
    "hit 只表示检索结果文本命中 expected_terms 或 expected_tags，仍需人工复核语义是否真的相关。",
    "如果某题命中差，优先改 expected_terms 或 domain synonyms，再考虑换 embedding/reranker。",
    "out_of_domain_low_confidence_rate 用于检查无关问题是否避免高置信召回。"
  ],
  failures: rows
    .filter((row) => !row.hit_at_5 && row.expected_behavior !== "should_not_retrieve_confident_training_answer")
    .map(compactRow),
  out_of_domain: outOfDomainRows.map(compactRow)
};

if (showDetails) report.rows = rows.map(compactRow);

console.log(JSON.stringify(report, null, 2));

function evaluateQuestion(item, ragIndex, { topK }) {
  const matches = retrieveLocalRag(item.question, ragIndex, { topK });
  const expectedTerms = normalizeList([...(item.expected_terms || []), ...(item.expected_tags || [])]);
  const matchRows = matches.map((match, index) => {
    const text = normalizeText(JSON.stringify(match));
    const matchedTerms = expectedTerms.filter((term) => text.includes(term));
    return {
      rank: index + 1,
      slug: match.slug,
      score: match.score,
      title: match.title,
      matched_terms: matchedTerms
    };
  });
  const topScore = matches[0]?.score || 0;
  const hitAt = (limit) => matchRows.slice(0, limit).some((match) => match.matched_terms.length > 0);
  return {
    id: item.id,
    question: item.question,
    expected_behavior: item.expected_behavior || "retrieve_relevant_training_knowledge",
    expected_topics: item.expected_topics || [],
    expected_terms: item.expected_terms || [],
    expected_tags: item.expected_tags || [],
    top_score: topScore,
    hit_at_1: hitAt(1),
    hit_at_3: hitAt(3),
    hit_at_5: hitAt(5),
    out_of_domain_low_confidence: item.expected_behavior === "should_not_retrieve_confident_training_answer"
      ? matches.length === 0 || topScore < 0.04
      : null,
    matches: matchRows
  };
}

function compactRow(row) {
  return {
    id: row.id,
    question: row.question,
    expected_topics: row.expected_topics,
    top_score: row.top_score,
    hit_at_1: row.hit_at_1,
    hit_at_3: row.hit_at_3,
    hit_at_5: row.hit_at_5,
    out_of_domain_low_confidence: row.out_of_domain_low_confidence,
    top_matches: row.matches.slice(0, 5)
  };
}

function normalizeList(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function ratio(count, total) {
  if (!total) return null;
  return Number((count / total).toFixed(3));
}
