import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embedTexts, hasVectorDomainSignal, rankVectorRagMatches } from "../server/vectorRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const index = JSON.parse(await readFile(path.join(root, "data", "rag", "vector_index.json"), "utf8"));
const evalSet = JSON.parse(await readFile(path.join(root, "data", "rag", "rag_eval_questions.json"), "utf8"));
const topK = Number(args.topK || 5);
const showDetails = Boolean(args.details);

const questions = evalSet.questions.map((item) => item.question);
const embeddingResult = await embedTexts(questions, {
  root,
  model: index.embedding_model,
  mode: "query",
  batchSize: Number(args.batchSize || 16)
});
const rows = evalSet.questions.map((item, itemIndex) =>
  evaluateQuestion(item, index, embeddingResult.embeddings[itemIndex] || [], { topK, threshold: args.threshold })
);

const inDomainRows = rows.filter((row) => row.expected_behavior !== "should_not_retrieve_confident_training_answer");
const outOfDomainRows = rows.filter((row) => row.expected_behavior === "should_not_retrieve_confident_training_answer");

const report = {
  ok: true,
  schema_version: "vector_rag_retrieval_eval_report.v1",
  source_contract: "human_reviewable_seed_eval_not_final_benchmark",
  eval_file: "data/rag/rag_eval_questions.json",
  retrieval_method: index.source_contract,
  embedding_model: index.embedding_model,
  index_chunks: index.chunk_count,
  question_count: rows.length,
  threshold: args.threshold ? Number(args.threshold) : index.low_confidence_threshold,
  metrics: {
    hit_at_1: ratio(inDomainRows.filter((row) => row.hit_at_1).length, inDomainRows.length),
    hit_at_3: ratio(inDomainRows.filter((row) => row.hit_at_3).length, inDomainRows.length),
    hit_at_5: ratio(inDomainRows.filter((row) => row.hit_at_5).length, inDomainRows.length),
    out_of_domain_low_confidence_rate: ratio(outOfDomainRows.filter((row) => row.out_of_domain_low_confidence).length, outOfDomainRows.length)
  },
  review_notes: [
    "hit 只表示检索结果文本命中 expected_terms 或 expected_tags，仍需人工复核语义是否真的相关。",
    "vector RAG 的优势应体现在同义表达和语义相近问题上，不代表可以跳过引用校验。",
    "out_of_domain_low_confidence_rate 用于检查无关问题是否避免高置信召回。"
  ],
  failures: rows
    .filter((row) => !row.hit_at_5 && row.expected_behavior !== "should_not_retrieve_confident_training_answer")
    .map(compactRow),
  out_of_domain: outOfDomainRows.map(compactRow)
};

if (showDetails) report.rows = rows.map(compactRow);

console.log(JSON.stringify(report, null, 2));

function evaluateQuestion(item, ragIndex, queryEmbedding, { topK, threshold }) {
  const matches = hasVectorDomainSignal(item.question)
    ? rankVectorRagMatches(queryEmbedding, ragIndex, {
    topK,
    lowConfidenceThreshold: threshold ? Number(threshold) : undefined
      })
    : [];
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
      ? matches.length === 0 || topScore < 0.35
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

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--details") parsed.details = true;
    else if (arg.startsWith("--topK=")) parsed.topK = arg.slice("--topK=".length);
    else if (arg.startsWith("--threshold=")) parsed.threshold = arg.slice("--threshold=".length);
    else if (arg.startsWith("--batch-size=")) parsed.batchSize = arg.slice("--batch-size=".length);
  }
  return parsed;
}
