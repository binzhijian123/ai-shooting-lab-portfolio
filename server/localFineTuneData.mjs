import { buildGroundedPortfolioAnswer, retrieveLocalRag } from "./localRagIndex.mjs";

export const LOCAL_FINETUNE_DATA_SCHEMA_VERSION = "shooting_lab_rag_sft_dataset.v1";

const SYSTEM_PROMPT = [
  "你是 AI 投篮实验室的本地小模型知识助手。",
  "只能依据用户提供的 RAG 知识卡回答，不能补充知识卡之外的事实。",
  "只回答通用训练知识，不根据个人视频或个人动作做最终诊断。",
  "必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。",
  "cited_slugs 只能引用输入知识卡中的 slug；证据不足时 cited_slugs 为空。"
].join("\n");

const GENERAL_QUESTION_TEMPLATES = [
  "怎么理解“{topic}”？",
  "{topic} 应该怎么练？",
  "如果出现 {issue}，可以怎么调整？",
  "{topic} 和投篮稳定性有什么关系？",
  "帮我用通俗语言解释 {topic}"
];

const REFUSAL_QUESTIONS = [
  "帮我分析我的投篮视频是不是手肘外翻？",
  "我的动作到底错在哪里？",
  "你看我的视频能不能直接告诉我该不该改动作？",
  "我是不是必须改成库里的投篮姿势？",
  "诊断一下我的投篮问题"
];

export function buildFineTuneDatasetFromIndex(index = {}, { maxExamples = 240 } = {}) {
  const examples = [];
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  for (const chunk of chunks) {
    if (examples.length >= maxExamples) break;
    const questions = buildQuestionsForChunk(chunk);
    for (const question of questions) {
      if (examples.length >= maxExamples) break;
      const matches = retrieveLocalRag(question, index, { topK: 3 });
      if (!matches.some((match) => match.slug === chunk.slug)) continue;
      const answer = buildGroundedPortfolioAnswer(question, matches);
      examples.push(buildChatExample(question, matches, answer, "grounded_rag_answer"));
    }
  }

  for (const question of REFUSAL_QUESTIONS) {
    examples.push(buildChatExample(question, [], {
      answer: "个人视频或个人动作的最终诊断需要教练结合视频证据确认。这里可以解释通用训练知识、拍摄要求或知识库里的训练概念。",
      cited_slugs: [],
      confidence: "low",
      boundary: "personal_diagnosis_refusal"
    }, "boundary_refusal"));
  }

  return {
    schema_version: LOCAL_FINETUNE_DATA_SCHEMA_VERSION,
    source_contract: "rag_context_to_json_answer_behavior_tuning",
    example_count: examples.length,
    examples
  };
}

export function splitFineTuneExamples(examples = [], { trainRatio = 0.86, validRatio = 0.07 } = {}) {
  const trainEnd = Math.floor(examples.length * trainRatio);
  const validEnd = trainEnd + Math.floor(examples.length * validRatio);
  return {
    train: examples.slice(0, trainEnd),
    valid: examples.slice(trainEnd, validEnd),
    test: examples.slice(validEnd)
  };
}

export function toMlxChatRecord(example = {}) {
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: example.user_content },
      { role: "assistant", content: JSON.stringify(example.expected_json) }
    ],
    metadata: {
      source: example.source,
      cited_slugs: example.expected_json?.cited_slugs || []
    }
  };
}

export function buildModelPrompt(question = "", references = []) {
  return [
    `问题：${String(question || "").trim()}`,
    "RAG 知识卡：",
    JSON.stringify(references.map(compactReference), null, 2),
    "请只依据这些知识卡输出 JSON。"
  ].join("\n");
}

function buildChatExample(question, references, expectedJson, source) {
  return {
    source,
    question,
    user_content: buildModelPrompt(question, references),
    expected_json: expectedJson
  };
}

function buildQuestionsForChunk(chunk = {}) {
  const titleTopic = readableTopic(chunk);
  const firstRule = chunk.diagnosis_rules?.[0] || {};
  const firstRepair = chunk.repair_actions?.[0] || {};
  const topic = firstRepair.drill || titleTopic;
  const issue = firstRule.if || titleTopic;
  return GENERAL_QUESTION_TEMPLATES.map((template) => template
    .replace("{topic}", topic)
    .replace("{issue}", issue)
  );
}

function readableTopic(chunk = {}) {
  const tagTopic = (chunk.tags || []).find((tag) => /起球|发力|肘|腕|髋|膝|节奏|ball|timing|elbow|wrist|hip|knee/i.test(tag));
  if (tagTopic) return tagTopic;
  return String(chunk.summary || chunk.title || "投篮训练要点").slice(0, 36);
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
