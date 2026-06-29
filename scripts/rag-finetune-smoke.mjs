import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGroundedPortfolioAnswer, retrieveLocalRag } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const index = JSON.parse(await readFile(path.join(root, "data", "rag", "local_rag_index.json"), "utf8"));
const train = await readJsonl(path.join(root, "data", "finetune", "shooting-rag-json", "train.jsonl"));
const valid = await readJsonl(path.join(root, "data", "finetune", "shooting-rag-json", "valid.jsonl"));
const test = await readJsonl(path.join(root, "data", "finetune", "shooting-rag-json", "test.jsonl"));
const minSftExamples = Number(process.env.MIN_SFT_EXAMPLES || 150);

assert.equal(index.schema_version, "shooting_lab_local_rag_index.v1");
assert(index.chunk_count >= 100, "RAG index should contain enough training chunks");

const retrieval = retrieveLocalRag("低位到高位起球怎么做？", index, { topK: 5 });
assert(retrieval.length > 0, "RAG query should retrieve at least one chunk");
assert(retrieval.some((match) => JSON.stringify(match).includes("起球") || JSON.stringify(match).includes("低手位")));

const answer = buildGroundedPortfolioAnswer("低位到高位起球怎么做？", retrieval);
assert(Array.isArray(answer.cited_slugs));
assert(answer.cited_slugs.length > 0);
for (const slug of answer.cited_slugs) {
  assert(retrieval.some((match) => match.slug === slug), `cited slug must come from retrieved references: ${slug}`);
}

const allRecords = [...train, ...valid, ...test];
assert(allRecords.length >= minSftExamples, `SFT dataset should contain at least ${minSftExamples} examples for this run`);
for (const record of allRecords) {
  assert(Array.isArray(record.messages));
  assert.equal(record.messages.at(-1).role, "assistant");
  const expected = JSON.parse(record.messages.at(-1).content);
  assert.equal(typeof expected.answer, "string");
  assert(Array.isArray(expected.cited_slugs));
  assert.equal(typeof expected.confidence, "string");
  assert.equal(typeof expected.boundary, "string");
}
assert(allRecords.some((record) => record.metadata?.source === "boundary_refusal"), "dataset should include refusal examples");

console.log(JSON.stringify({
  ok: true,
  schema_version: "rag_finetune_smoke.v1",
  rag: {
    index_chunks: index.chunk_count,
    query_matches: retrieval.length,
    cited_slugs: answer.cited_slugs
  },
  finetune_dataset: {
    train: train.length,
    valid: valid.length,
    test: test.length,
    total: allRecords.length,
    format: "chat_messages_jsonl"
  },
  checks: [
    "rag_index_available",
    "query_retrieves_relevant_chunks",
    "answer_citations_are_from_retrieved_context",
    "sft_records_are_valid_json_messages",
    "boundary_refusal_examples_present"
  ]
}, null, 2));

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
