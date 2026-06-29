import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "data", "finetune", "shooting-rag-deepseek-teacher");
const summary = JSON.parse(await readFile(path.join(outputDir, "dataset_summary.json"), "utf8"));
const train = await readJsonl(path.join(outputDir, "train.jsonl"));
const valid = await readJsonl(path.join(outputDir, "valid.jsonl"));
const test = await readJsonl(path.join(outputDir, "test.jsonl"));

assert.equal(summary.schema_version, "deepseek_teacher_rag_sft_dataset.v1");
assert(train.length > 0, "teacher train split should not be empty");
for (const record of [...train, ...valid, ...test]) {
  assert(Array.isArray(record.messages), "record must use chat messages format");
  const assistant = record.messages.find((message) => message.role === "assistant");
  assert(assistant, "record must include assistant answer");
  const expected = JSON.parse(assistant.content);
  assert.equal(typeof expected.answer, "string");
  assert(Array.isArray(expected.cited_slugs));
  assert(["low", "medium", "high"].includes(expected.confidence));
  assert(["general_training_only", "personal_diagnosis_refusal", "knowledge_insufficient"].includes(expected.boundary));
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "deepseek_teacher_dataset_smoke.v1",
  dry_run: summary.dry_run,
  accepted: summary.accepted,
  rejected: summary.rejected,
  train: train.length,
  valid: valid.length,
  test: test.length,
  checks: [
    "teacher_dataset_summary_present",
    "chat_messages_jsonl_valid",
    "assistant_json_valid",
    "confidence_boundary_enums_valid"
  ]
}, null, 2));

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
