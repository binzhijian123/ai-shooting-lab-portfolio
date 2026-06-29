import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveLocalRag } from "../server/localRagIndex.mjs";
import { embedTexts, hasVectorDomainSignal, rankVectorRagMatches } from "../server/vectorRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const topK = Number(args.topK || 5);
const sparseIndex = JSON.parse(await readFile(path.join(root, "data", "rag", "local_rag_index.json"), "utf8"));
const vectorIndex = JSON.parse(await readFile(path.join(root, "data", "rag", "vector_index.json"), "utf8"));
const evalSet = JSON.parse(await readFile(path.join(root, "data", "rag", "rag_eval_questions.json"), "utf8"));

const sparseRows = evalSet.questions.map((item) => evaluateMatches(item, retrieveLocalRag(item.question, sparseIndex, { topK })));
const vectorEmbeddings = await embedTexts(evalSet.questions.map((item) => item.question), {
  root,
  model: vectorIndex.embedding_model,
  mode: "query",
  batchSize: Number(args.batchSize || 16)
});
const vectorRows = evalSet.questions.map((item, index) => {
  const matches = hasVectorDomainSignal(item.question)
    ? rankVectorRagMatches(vectorEmbeddings.embeddings[index] || [], vectorIndex, { topK })
    : [];
  return evaluateMatches(item, matches);
});

const sparseMetrics = metricsFor(sparseRows);
const vectorMetrics = metricsFor(vectorRows);
const markdown = buildMarkdownReport({
  topK,
  sparseIndex,
  vectorIndex,
  sparseMetrics,
  vectorMetrics,
  sparseRows,
  vectorRows
});

const outputPath = path.join(root, "docs", "RAG_RETRIEVAL_COMPARISON.md");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, markdown);

console.log(JSON.stringify({
  ok: true,
  schema_version: "rag_retrieval_comparison_result.v1",
  output_path: path.relative(root, outputPath),
  sparse: sparseMetrics,
  vector: vectorMetrics
}, null, 2));

function evaluateMatches(item, matches) {
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

function metricsFor(rows) {
  const inDomainRows = rows.filter((row) => row.expected_behavior !== "should_not_retrieve_confident_training_answer");
  const outOfDomainRows = rows.filter((row) => row.expected_behavior === "should_not_retrieve_confident_training_answer");
  return {
    hit_at_1: ratio(inDomainRows.filter((row) => row.hit_at_1).length, inDomainRows.length),
    hit_at_3: ratio(inDomainRows.filter((row) => row.hit_at_3).length, inDomainRows.length),
    hit_at_5: ratio(inDomainRows.filter((row) => row.hit_at_5).length, inDomainRows.length),
    out_of_domain_low_confidence_rate: ratio(outOfDomainRows.filter((row) => row.out_of_domain_low_confidence).length, outOfDomainRows.length)
  };
}

function buildMarkdownReport({ topK, sparseIndex, vectorIndex, sparseMetrics, vectorMetrics, sparseRows, vectorRows }) {
  const regressions = vectorRows
    .filter((row, index) => sparseRows[index]?.hit_at_5 && !row.hit_at_5 && row.expected_behavior !== "should_not_retrieve_confident_training_answer")
    .slice(0, 8);
  const vectorWins = vectorRows
    .filter((row, index) => !sparseRows[index]?.hit_at_5 && row.hit_at_5 && row.expected_behavior !== "should_not_retrieve_confident_training_answer")
    .slice(0, 8);

  return [
    "# RAG 检索对比报告",
    "",
    "本文档由 `scripts/compare-rag-retrieval.mjs` 生成，用于对比当前 sparse RAG 和本地 embedding vector RAG。",
    "",
    "## 配置",
    "",
    `- Eval set: \`data/rag/rag_eval_questions.json\``,
    `- TopK: ${topK}`,
    `- Sparse index: ${sparseIndex.source_contract}, chunks=${sparseIndex.chunk_count}`,
    `- Vector index: ${vectorIndex.source_contract}, chunks=${vectorIndex.chunk_count}`,
    `- Embedding model: \`${vectorIndex.embedding_model}\`, dim=${vectorIndex.embedding_dimension}`,
    "",
    "## 指标",
    "",
    "| 方法 | hit@1 | hit@3 | hit@5 | OOD low-confidence |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Sparse | ${fmt(sparseMetrics.hit_at_1)} | ${fmt(sparseMetrics.hit_at_3)} | ${fmt(sparseMetrics.hit_at_5)} | ${fmt(sparseMetrics.out_of_domain_low_confidence_rate)} |`,
    `| Vector | ${fmt(vectorMetrics.hit_at_1)} | ${fmt(vectorMetrics.hit_at_3)} | ${fmt(vectorMetrics.hit_at_5)} | ${fmt(vectorMetrics.out_of_domain_low_confidence_rate)} |`,
    "",
    "## Vector 优于 Sparse 的样例",
    "",
    ...(vectorWins.length ? vectorWins.map(formatCase) : ["暂无。"]),
    "",
    "## Vector 需要继续调整的样例",
    "",
    ...(regressions.length ? regressions.map(formatCase) : ["暂无明显 top5 回归。"]),
    "",
    "## 说明",
    "",
    "- hit@k 只表示 top-k 检索结果中命中了人工标注的 expected terms/tags，不等于最终回答质量。",
    "- 生成回答时仍必须校验 `cited_slugs` 是否来自 RAG top-k。",
    "- 当前版本是本地 JSON 向量索引 MVP，后续可以替换为 Chroma、FAISS、LanceDB 或 Qdrant。"
  ].join("\n");
}

function formatCase(row) {
  const top = row.matches[0];
  return `- ${row.id}：${row.question} -> top1=${top?.slug || "none"} score=${top?.score || 0}`;
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

function fmt(value) {
  return value === null ? "n/a" : value.toFixed(3);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg.startsWith("--topK=")) parsed.topK = arg.slice("--topK=".length);
    else if (arg.startsWith("--batch-size=")) parsed.batchSize = arg.slice("--batch-size=".length);
  }
  return parsed;
}
