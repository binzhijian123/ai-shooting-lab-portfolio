import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_GOLDEN_STANDARD_RELATIVE_PATH = path.join(
  "data",
  "finetune",
  "golden-rag-standard-20",
  "standard_qa.jsonl"
);

export const ALLOWED_TEACHER_BOUNDARIES = [
  "general_training_only",
  "personal_diagnosis_refusal",
  "knowledge_insufficient"
];

export async function loadGoldenTeacherStandard(root, {
  relativePath = DEFAULT_GOLDEN_STANDARD_RELATIVE_PATH
} = {}) {
  const filePath = path.join(root, relativePath);
  const text = await readFile(filePath, "utf8");
  const records = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseGoldenLine(line, index + 1));

  const valid = [];
  const invalid = [];
  for (const record of records) {
    const validation = validateGoldenRecord(record);
    if (validation.ok) valid.push(record);
    else invalid.push({ id: record?.id, question: record?.question, errors: validation.errors });
  }

  return {
    path: filePath,
    relative_path: relativePath,
    records,
    valid,
    invalid
  };
}

export function selectGoldenTeacherExamples(records = [], { limit = 8 } = {}) {
  const buckets = new Map(ALLOWED_TEACHER_BOUNDARIES.map((boundary) => [boundary, []]));
  for (const record of records) {
    const boundary = record?.answer?.boundary;
    if (buckets.has(boundary)) buckets.get(boundary).push(record);
  }

  const selected = [];
  const addFrom = (boundary, count) => {
    for (const record of buckets.get(boundary) || []) {
      if (selected.length >= limit || count <= 0) break;
      if (!selected.includes(record)) {
        selected.push(record);
        count -= 1;
      }
    }
  };

  addFrom("general_training_only", Math.max(1, limit - 4));
  addFrom("personal_diagnosis_refusal", 2);
  addFrom("knowledge_insufficient", 2);

  for (const record of records) {
    if (selected.length >= limit) break;
    if (!selected.includes(record)) selected.push(record);
  }

  return selected.slice(0, limit);
}

export function buildGoldenTeacherPromptBlock(records = []) {
  const examples = records.map((record) => ({
    question: record.question,
    answer: record.answer
  }));

  return [
    "下面是本项目的 golden standard。你必须模仿它的字段、边界判断、回答语气和引用规则。",
    "注意：golden standard 只是格式和质量示范，不是本次问题的可引用知识来源。",
    "本次回答的 cited_slugs 只能来自用户消息里的 rag_references。",
    JSON.stringify(examples, null, 2)
  ].join("\n");
}

export function validateTeacherAnswerShape(answer, allowedSlugs = new Set()) {
  const errors = [];
  if (!answer || typeof answer !== "object") errors.push("answer_not_object");
  if (typeof answer?.answer !== "string" || !answer.answer.trim()) errors.push("missing_answer_text");
  if (!Array.isArray(answer?.cited_slugs)) {
    errors.push("cited_slugs_not_array");
  } else {
    for (const slug of answer.cited_slugs) {
      if (typeof slug !== "string" || !slug.trim()) errors.push("invalid_cited_slug_type");
      else if (allowedSlugs.size && !allowedSlugs.has(slug)) errors.push(`invalid_cited_slug:${slug}`);
    }
  }
  if (!["low", "medium", "high"].includes(answer?.confidence)) errors.push("invalid_confidence");
  if (!ALLOWED_TEACHER_BOUNDARIES.includes(answer?.boundary)) errors.push("invalid_boundary");
  return { ok: errors.length === 0, errors };
}

function parseGoldenLine(line, lineNumber) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return {
      id: `invalid_line_${lineNumber}`,
      parse_error: error.message,
      raw: line
    };
  }
}

function validateGoldenRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") errors.push("record_not_object");
  if (typeof record?.question !== "string" || !record.question.trim()) errors.push("missing_question");
  const answerValidation = validateTeacherAnswerShape(record?.answer, new Set());
  errors.push(...answerValidation.errors);
  return { ok: errors.length === 0, errors };
}
