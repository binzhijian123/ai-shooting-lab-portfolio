import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../server/env.mjs";
import {
  buildGoldenTeacherPromptBlock,
  loadGoldenTeacherStandard,
  selectGoldenTeacherExamples,
  validateTeacherAnswerShape
} from "../server/goldenTeacherStandard.mjs";
import { buildModelPrompt, splitFineTuneExamples, toMlxChatRecord } from "../server/localFineTuneData.mjs";
import { retrieveLocalRag } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
await loadLocalEnv(path.join(root, ".env"));

const args = parseArgs(process.argv.slice(2));
const count = Number(args.count || 100);
const topK = Number(args.topK || 3);
const dryRun = Boolean(args.dryRun);
const useGoldenStandard = !args.noGoldenStandard;
const goldenExampleLimit = Math.max(1, Number(args.goldenExamples || 8));
const model = args.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const baseUrl = args.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const apiKey = process.env.DEEPSEEK_API_KEY;
const indexPath = path.join(root, "data", "rag", "local_rag_index.json");
const outputDir = resolveOutputDir(args.outputDir, path.join("data", "finetune", "shooting-rag-deepseek-teacher"));
const rawAcceptedPath = path.join(outputDir, "accepted_raw.jsonl");
const rawRejectedPath = path.join(outputDir, "rejected_raw.jsonl");

const index = JSON.parse(await readFile(indexPath, "utf8"));
const goldenStandard = useGoldenStandard
  ? await loadGoldenTeacherStandard(root)
  : { relative_path: null, valid: [], invalid: [] };
if (useGoldenStandard && goldenStandard.invalid.length) {
  console.error(JSON.stringify({
    ok: false,
    reason: "invalid_golden_standard",
    path: goldenStandard.relative_path,
    invalid: goldenStandard.invalid
  }, null, 2));
  process.exit(1);
}
const goldenExamples = useGoldenStandard
  ? selectGoldenTeacherExamples(goldenStandard.valid, { limit: goldenExampleLimit })
  : [];
const goldenPromptBlock = useGoldenStandard
  ? buildGoldenTeacherPromptBlock(goldenExamples)
  : "";
const questions = buildTeacherQuestionBank(index).slice(0, Math.max(1, count));
const accepted = [];
const rejected = [];

if (!dryRun && !apiKey) {
  console.error("DEEPSEEK_API_KEY is missing. Set it in your shell or .env; do not commit it.");
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

for (const question of questions) {
  const references = retrieveLocalRag(question, index, { topK });
  const allowedSlugs = new Set(references.map((reference) => reference.slug));
  if (!references.length) {
    rejected.push({ question, reason: "no_references" });
    continue;
  }

  const teacher = dryRun
    ? buildDryRunTeacherAnswer(question, references)
    : await callDeepSeekTeacher({ question, references, apiKey, model, baseUrl, goldenPromptBlock });
  const validation = validateTeacherAnswer(teacher, allowedSlugs);
  const raw = { question, references, teacher, validation };
  if (!validation.ok) {
    rejected.push(raw);
    continue;
  }

  accepted.push({
    source: dryRun ? "dry_run_teacher_answer" : "deepseek_teacher_answer",
    question,
    user_content: buildModelPrompt(question, references),
    expected_json: {
      answer: teacher.answer.trim(),
      cited_slugs: teacher.cited_slugs,
      confidence: teacher.confidence,
      boundary: teacher.boundary
    }
  });
}

const split = splitFineTuneExamples(accepted);
await writeJsonl(path.join(outputDir, "train.jsonl"), split.train.map(toMlxChatRecord));
await writeJsonl(path.join(outputDir, "valid.jsonl"), split.valid.map(toMlxChatRecord));
await writeJsonl(path.join(outputDir, "test.jsonl"), split.test.map(toMlxChatRecord));
await writeJsonl(rawAcceptedPath, accepted);
await writeJsonl(rawRejectedPath, rejected);
await writeFile(path.join(outputDir, "dataset_summary.json"), `${JSON.stringify({
  schema_version: "deepseek_teacher_rag_sft_dataset.v1",
  source_contract: "deepseek_teacher_generates_rag_grounded_answers_after_local_retrieval",
  dry_run: dryRun,
  model: dryRun ? "dry_run" : model,
  output_dir: path.relative(root, outputDir),
  golden_standard: {
    enabled: useGoldenStandard,
    path: goldenStandard.relative_path,
    total_valid_examples: goldenStandard.valid.length,
    prompt_examples: goldenExamples.length
  },
  requested_count: count,
  generated_questions: questions.length,
  accepted: accepted.length,
  rejected: rejected.length,
  split_counts: {
    train: split.train.length,
    valid: split.valid.length,
    test: split.test.length
  },
  first_accepted_example: accepted[0] ? toMlxChatRecord(accepted[0]) : null,
  validation_policy: [
    "json_parse_required",
    "answer_required",
    "cited_slugs_must_come_from_rag_references",
    "confidence_must_be_low_medium_or_high",
    "boundary_must_be_known"
  ]
}, null, 2)}\n`);

console.log(JSON.stringify({
  ok: accepted.length > 0,
  schema_version: "build_deepseek_teacher_dataset_result.v1",
  dry_run: dryRun,
  output_dir: path.relative(root, outputDir),
  golden_standard_examples: goldenExamples.length,
  requested_count: count,
  accepted: accepted.length,
  rejected: rejected.length,
  train: split.train.length,
  valid: split.valid.length,
  test: split.test.length
}, null, 2));

function buildTeacherQuestionBank(index) {
  const questions = [
    "低位到高位起球怎么做？",
    "手肘外翻会影响什么？",
    "辅助手发力应该怎么理解？",
    "投篮时重心前倾怎么调整？",
    "怎么拍 side view 投篮视频？",
    "下肢发力和起球节奏有什么关系？",
    "主视眼和起球线路有什么关系？",
    "我的投篮视频是不是手肘外翻？",
    "你直接诊断一下我的动作问题。",
    "量子力学纠缠是什么意思？"
  ];
  for (const chunk of index.chunks || []) {
    if (questions.length >= 400) break;
    const title = compactTopic(chunk.title || chunk.summary);
    const repair = chunk.repair_actions?.[0]?.drill || chunk.repair_actions?.[0]?.cue || "";
    const rule = chunk.diagnosis_rules?.[0]?.if || "";
    const tags = (chunk.tags || []).filter(Boolean).slice(0, 4);
    for (const tag of tags) {
      questions.push(`${tag} 和投篮稳定性有什么关系？`);
    }
    if (repair) questions.push(`${repair} 应该怎么练？`);
    if (rule) questions.push(`如果出现 ${rule}，可以怎么调整？`);
    if (title) questions.push(`帮我用通俗语言解释：${title}`);
  }
  return [...new Set(questions.map((question) => question.trim()).filter(Boolean))];
}

async function callDeepSeekTeacher({ question, references, apiKey, model, baseUrl, goldenPromptBlock }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "你是 AI 投篮实验室的 teacher model，任务是生成给本地小模型学习的高质量 SFT 标准答案。",
            "必须只依据用户提供的 RAG 知识卡回答，不能补充知识卡之外的事实。",
            "只回答通用训练知识；涉及个人视频/个人动作诊断时必须拒答并说明需要教练结合视频确认。",
            "必须输出 json，格式示例：",
            "{\"answer\":\"...\",\"cited_slugs\":[\"kb-...\"],\"confidence\":\"medium\",\"boundary\":\"general_training_only\"}",
            "cited_slugs 只能来自输入知识卡的 slug。confidence 只能是 low、medium、high。boundary 只能是 general_training_only、personal_diagnosis_refusal、knowledge_insufficient。",
            goldenPromptBlock || ""
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            rag_references: references.map(compactReference)
          })
        }
      ],
      response_format: { type: "json_object" },
      stream: false,
      temperature: 0.2,
      max_tokens: 900
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  return parseJsonObject(data.choices?.[0]?.message?.content);
}

function validateTeacherAnswer(answer, allowedSlugs) {
  return validateTeacherAnswerShape(answer, allowedSlugs);
}

function buildDryRunTeacherAnswer(question, references) {
  const top = references.slice(0, 2);
  return {
    answer: `根据检索到的知识卡，${top.map((reference) => `${reference.title}：${reference.summary}`).join("；")}。这是通用训练解释，不构成个人视频诊断。`,
    cited_slugs: top.map((reference) => reference.slug),
    confidence: top.length ? "medium" : "low",
    boundary: question.includes("我的") || question.includes("诊断") ? "personal_diagnosis_refusal" : "general_training_only"
  };
}

function parseJsonObject(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
}

function compactReference(reference = {}) {
  return {
    slug: reference.slug,
    title: reference.title,
    summary: reference.summary,
    tags: reference.tags?.slice(0, 8) || [],
    diagnosis_rules: (reference.diagnosis_rules || []).slice(0, 2),
    repair_actions: (reference.repair_actions || []).slice(0, 2)
  };
}

function compactTopic(value) {
  return String(value || "")
    .replace(/#\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-golden-standard") parsed.noGoldenStandard = true;
    else if (arg.startsWith("--golden-examples=")) parsed.goldenExamples = arg.slice("--golden-examples=".length);
    else if (arg.startsWith("--output-dir=")) parsed.outputDir = arg.slice("--output-dir=".length);
    else if (arg.startsWith("--count=")) parsed.count = arg.slice("--count=".length);
    else if (arg.startsWith("--top-k=")) parsed.topK = arg.slice("--top-k=".length);
    else if (arg.startsWith("--model=")) parsed.model = arg.slice("--model=".length);
    else if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.slice("--base-url=".length);
  }
  return parsed;
}

function resolveOutputDir(value, fallbackRelativePath) {
  if (!value) return path.join(root, fallbackRelativePath);
  return path.isAbsolute(value) ? value : path.join(root, value);
}

async function writeJsonl(filePath, records) {
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}
