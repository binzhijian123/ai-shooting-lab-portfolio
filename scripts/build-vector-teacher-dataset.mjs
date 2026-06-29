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
import { retrieveVectorRag } from "../server/vectorRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
await loadLocalEnv(path.join(root, ".env"));

const args = parseArgs(process.argv.slice(2));
const targetCount = Math.max(50, Number(args.count || 300));
const topK = Number(args.topK || 5);
const dryRun = Boolean(args.dryRun);
const useGoldenStandard = !args.noGoldenStandard;
const goldenExampleLimit = Math.max(1, Number(args.goldenExamples || 8));
const model = args.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const baseUrl = args.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const apiKey = process.env.DEEPSEEK_API_KEY;
const vectorIndexPath = path.join(root, "data", "rag", "vector_index.json");
const outputDir = resolveOutputDir(args.outputDir, path.join("data", "finetune", "shooting-vector-rag-teacher-v1"));
const rawAcceptedPath = path.join(outputDir, "accepted_raw.jsonl");
const rawRejectedPath = path.join(outputDir, "rejected_raw.jsonl");

const index = JSON.parse(await readFile(vectorIndexPath, "utf8"));
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

console.error(`[build-vector-teacher] 正在基于向量 RAG 索引生成问题库...`);
const questions = buildTeacherQuestionBank(index, targetCount * 2);
const accepted = [];
const rejected = [];

if (!dryRun && !apiKey) {
  console.error("DEEPSEEK_API_KEY is missing. Set it in your shell or .env.");
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

for (let i = 0; i < questions.length && accepted.length < targetCount; i++) {
  const question = questions[i];
  console.error(`[build-vector-teacher] [${accepted.length + 1}/${targetCount}] 处理: ${question.slice(0, 50)}`);

  const references = await retrieveVectorRag(question, index, {
    root,
    topK,
    model: index.embedding_model
  });
  const allowedSlugs = new Set(references.map((r) => r.slug));

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

if (accepted.length < 50) {
  console.error(`Too few accepted (${accepted.length}/${questions.length})`);
  process.exit(1);
}

console.error(`[build-vector-teacher] 生成完成: accepted=${accepted.length}, rejected=${rejected.length}`);

const split = splitFineTuneExamples(accepted);
const writeOpts = { flag: "w" };
await writeFile(path.join(outputDir, "train.jsonl"), split.train.map(toMlxChatRecord).map((r) => JSON.stringify(r)).join("\n") + "\n", writeOpts);
await writeFile(path.join(outputDir, "valid.jsonl"), split.valid.map(toMlxChatRecord).map((r) => JSON.stringify(r)).join("\n") + "\n", writeOpts);
await writeFile(path.join(outputDir, "test.jsonl"), split.test.map(toMlxChatRecord).map((r) => JSON.stringify(r)).join("\n") + "\n", writeOpts);
await writeFile(rawAcceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + "\n", writeOpts);
await writeFile(rawRejectedPath, rejected.map((r) => JSON.stringify(r)).join("\n") + "\n", writeOpts);
await writeFile(path.join(outputDir, "dataset_summary.json"), JSON.stringify({
  schema_version: "deepseek_teacher_vector_rag_sft_dataset.v1",
  source_contract: "deepseek_teacher_generates_rag_grounded_answers_after_vector_rag_retrieval",
  dry_run: dryRun,
  model: dryRun ? "dry_run" : model,
  output_dir: path.relative(root, outputDir),
  golden_standard: {
    enabled: useGoldenStandard,
    path: goldenStandard.relative_path,
    total_valid_examples: goldenStandard.valid.length,
    prompt_examples: goldenExamples.length
  },
  requested_count: targetCount,
  generated_questions: questions.length,
  accepted: accepted.length,
  rejected: rejected.length,
  split_counts: {
    train: split.train.length,
    valid: split.valid.length,
    test: split.test.length
  },
  validation_policy: [
    "json_parse_required",
    "answer_required",
    "cited_slugs_must_come_from_rag_references",
    "confidence_must_be_low_medium_or_high",
    "boundary_must_be_known"
  ]
}, null, 2) + "\n", writeOpts);

console.log(JSON.stringify({
  ok: accepted.length >= 50,
  schema_version: "build_vector_teacher_dataset_result.v1",
  dry_run: dryRun,
  output_dir: path.relative(root, outputDir),
  golden_standard_examples: goldenExamples.length,
  requested_count: targetCount,
  generated_questions: questions.length,
  accepted: accepted.length,
  rejected: rejected.length,
  train: split.train.length,
  valid: split.valid.length,
  test: split.test.length
}, null, 2));

function buildTeacherQuestionBank(index, targetCount) {
  const questions = [];
  const TAG_LABELS = {
    elbow: "手肘位置",
    wrist: "手腕动作",
    hip: "髋部发力",
    knee: "膝盖角度",
    timing: "动作节奏",
    ball: "球路控制",
    power: "发力链条",
    rotation: "身体旋转",
    shoulder: "肩部姿态",
    "ball_pickup": "起球线路",
    "dominant_eye": "主视眼",
    "lower_body_power": "下肢发力"
  };

  const nonGenerativePatterns = ["未直接解决","未提供具体","未具体讲解","未涉及","展示扣篮","仅展示扣篮","扣篮大赛","扣篮表现","扣篮集锦","视频标题声称","文案内容仅","文案内容过于笼统","品牌推广","品牌合作","视频展示了","视频主要展示","视频介绍","唤起观众对童年","缺乏具体细节","无实际投篮教学","转录稿.*扣篮","转录稿.*未包含","转写稿内容","暗示了后仰","伤病史","回顾.*合作","回顾.*品牌"];
const chunks = (index.chunks || []).filter((c) => {
    const text = `${c.title || ""} ${c.summary || ""}`;
    if (nonGenerativePatterns.some((p) => new RegExp(p).test(text))) return false;
    if (/纪念|悼念|哀悼|怀念|不包含投篮技术|不涉及|蒙特沃德/i.test(text)) return false;
    const rules = c.diagnosis_rules || [];
    const actions = c.repair_actions || [];
    return rules.some((r) => {
      const t = `${r.if || ""} ${r.then || ""} ${r.repair || ""}`;
      return t.length > 15 && !/无法提取|not_stated/i.test(t);
    }) || actions.some((a) => a?.drill && a.drill !== "not_stated");
  });

  for (const chunk of chunks) {
    if (questions.length >= targetCount) break;
    const summary = (chunk.summary || "").trim();
    const tags = (chunk.tags || []).filter(Boolean);
    const firstRule = (chunk.diagnosis_rules || [])[0] || {};
    const firstRepair = (chunk.repair_actions || [])[0] || {};
    const condition = firstRule.if || "";
    const repairTopic = firstRepair.cue || firstRepair.drill || "";
    const stableTags = tags.filter((t) => TAG_LABELS[t]);

    const tryAdd = (q) => {
      const norm = q.replace(/\s+/g, " ").trim();
      if (norm.length > 6 && !questions.includes(norm)) questions.push(norm);
    };

    if (summary.length > 10) tryAdd(`投篮中怎么理解：${summary.slice(0, 40)}`);
    if (condition.length > 8) tryAdd(`如果 ${condition.slice(0, 60)}，应该怎么调整投篮动作？`);
    if (repairTopic.length > 3) tryAdd(`${repairTopic.slice(0, 40)}的训练方法是什么？`);
    for (const tag of stableTags.slice(0, 2)) {
      const label = TAG_LABELS[tag] || tag;
      tryAdd(`${label}如何影响投篮稳定性？`);
      tryAdd(`${label}在投篮中的作用是什么？`);
    }
    const drills = (chunk.repair_actions || []).filter((a) => a?.drill && a.drill !== "not_stated");
    for (const d of drills.slice(0, 2)) {
      if (d.drill && d.drill.length > 4) tryAdd(`"${d.drill.slice(0, 35)}"这个训练的具体操作方法？`);
    }
  }

  const REFUSAL_QUESTIONS = [
    "帮我分析我的投篮视频是不是手肘外翻？",
    "我的动作到底错在哪里？",
    "你看我的视频能不能直接告诉我该不该改动作？",
    "我是不是必须改成库里的投篮姿势？",
    "诊断一下我的投篮问题",
    "你直接诊断一下我的动作问题。",
    "帮我看看我的投篮视频哪里不对？",
    "我能改掉手快脚慢的毛病吗？",
    "我的发力脱节要怎么治？",
    "你帮我看看我应该怎么调整投篮？",
    "我的投篮为什么不准？帮我分析一下",
    "你觉得库里一段式投篮适合我吗？"
  ];
  for (const q of REFUSAL_QUESTIONS) {
    if (questions.length < targetCount && !questions.includes(q)) questions.push(q);
  }

  const INSUFFICIENT_QUESTIONS = [
    "量子力学纠缠和投篮有什么关系？",
    "投篮时应该吃什么补剂提升命中率？",
    "如何通过训练让弹跳增加30厘米？",
    "跑步机的速度设置应该怎么调？",
    "中国男篮什么时候能拿奥运金牌？",
    "乔丹在耐克的合同金额是多少？",
    "NBA历史上三分最准的球员是谁？"
  ];
  for (const q of INSUFFICIENT_QUESTIONS) {
    if (questions.length < targetCount && !questions.includes(q)) questions.push(q);
  }

  const FALLBACKS = [
    "投篮时手腕应该保持什么姿势？",
    "如何提高投篮连贯性？",
    "投篮弧线太低怎么办？",
    "跳投力量不够怎么练？",
    "投篮辅助手有什么用？",
    "怎么判断自己投篮姿势是否标准？",
    "近筐投篮的技术要点是什么？",
    "投篮出手点高低有什么区别？",
    "投篮时肩膀需要放松吗？",
    "三段式投篮和二段式投篮的区别是什么？",
    "起球线路对命中率有什么影响？",
    "投篮时核心要收紧吗？",
    "怎么提高三分命中率？",
    "投篮时手肘应该指向哪里？",
    "如何改善投篮时的手臂外翻？"
  ];
  while (questions.length < targetCount) {
    for (const q of FALLBACKS) {
      if (questions.length < targetCount) questions.push(q);
    }
  }

  return [...new Set(questions)].slice(0, targetCount);
}

async function callDeepSeekTeacher({ question, references, apiKey, model, baseUrl, goldenPromptBlock }) {
  const maxRetries = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: [
                "你是 AI 投篮实验室的 teacher model，任务是生成高质量 SFT 标准答案给本地小模型学习。",
                "必须只依据用户提供的 RAG 知识卡回答。",
                "只回答通用训练知识；涉及个人视频诊断时明确拒答。",
                "必须输出 JSON 格式：\\{\"answer\":\"...\",\"cited_slugs\":[\"kb-...\"],\"confidence\":\"medium\",\"boundary\":\"general_training_only\"\\}",
                "cited_slugs 只能来自输入知识卡的 slug。confidence 只能是 low/medium/high。boundary 只能是 general_training_only/personal_diagnosis_refusal/knowledge_insufficient。",
                goldenPromptBlock || ""
              ].join("\n")
            },
            {
              role: "user",
              content: JSON.stringify({
                question,
                rag_references: references.map((r) => ({
                  slug: r.slug, title: r.title, summary: r.summary,
                  diagnosis_rules: (r.diagnosis_rules || []).slice(0, 2),
                  repair_actions: (r.repair_actions || []).slice(0, 2)
                }))
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
    } catch (error) {
      lastError = error;
      console.error(`[build-vector-teacher] API 调用失败 (尝试 ${attempt}/${maxRetries}): ${error.message.slice(0, 100)}`);
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        console.error(`[build-vector-teacher] 等待 ${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function validateTeacherAnswer(answer, allowedSlugs) {
  return validateTeacherAnswerShape(answer, allowedSlugs);
}

function buildDryRunTeacherAnswer(question, references) {
  const top = references.slice(0, 2);
  return {
    answer: `根据知识库：${top.map((r) => `${r.title}：${r.summary}`).join("；")}。这是通用训练知识。`,
    cited_slugs: top.map((r) => r.slug),
    confidence: top.length ? "medium" : "low",
    boundary: /我的|诊断/i.test(question) ? "personal_diagnosis_refusal" : "general_training_only"
  };
}

function parseJsonObject(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
  catch { return null; }
}
function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-golden-standard") parsed.noGoldenStandard = true;
    else if (arg.startsWith("--golden-examples=")) parsed.goldenExamples = arg.slice("--golden-examples=".length);
    else if (arg.startsWith("--output-dir=")) parsed.outputDir = arg.slice("--output-dir=".length);
    else if (arg.startsWith("--count=")) parsed.count = arg.slice("--count=".length);
    else if (arg.startsWith("--topK=")) parsed.topK = arg.slice("--topK=".length);
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
