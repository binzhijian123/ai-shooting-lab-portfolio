import {
  ARC_LAB_MVP_CONTRACT,
  CAMERA_VIEWS,
  DRILL_LIBRARY_SEED,
  PROBLEM_TAGS
} from "./arcLabContracts.mjs";

export const ARC_LAB_KNOWLEDGE_ASSISTANT_SCHEMA_VERSION = "arc_lab_knowledge_assistant_contract.v1";

const DEFAULT_DAILY_LIMIT = ARC_LAB_MVP_CONTRACT.knowledge_assistant.default_daily_ai_answer_limit;
const DEFAULT_RAG_LIMIT = 3;

const PERSONAL_DIAGNOSIS_PATTERNS = [
  /我的.*(视频|动作|投篮|姿势).*(问题|错|对不对|是不是|要不要|该不该|诊断|分析)/i,
  /(帮我|给我).*(看|分析|诊断).*(视频|动作|投篮|姿势)/i,
  /(我是不是|我是否|我该不该|我要不要).*(改|调整|问题|错误)/i,
  /what('| i)?s wrong with my (shot|form|video)/i,
  /is my (shot|form|video).*(wrong|bad|okay|ok)/i,
  /should i change my (shot|form)/i,
  /diagnose my (shot|form|video)/i
];

const FILMING_PATTERNS = [
  /(怎么|如何).*(拍|录).*(侧面|正面|背面|side|front|back)/i,
  /how.*film.*(side|front|back)/i
];

export function classifyStudentKnowledgeQuestion(question = "") {
  const normalizedQuestion = String(question || "").trim();
  const asksPersonalDiagnosis = PERSONAL_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(normalizedQuestion));
  if (asksPersonalDiagnosis) {
    return {
      schema_version: "arc_lab_student_question_classification.v1",
      category: "personal_video_diagnosis",
      allowed: false,
      reason: "personal conclusions require coach-confirmed feedback and video review"
    };
  }

  if (FILMING_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return {
      schema_version: "arc_lab_student_question_classification.v1",
      category: "filming_requirement",
      allowed: true
    };
  }

  return {
    schema_version: "arc_lab_student_question_classification.v1",
    category: "general_training_knowledge",
    allowed: true
  };
}

export function buildStudentKnowledgeDirectory(knowledgeBase = {}, { limit = 8 } = {}) {
  const cards = Array.isArray(knowledgeBase.cards) ? knowledgeBase.cards : [];
  const articleCards = cards
    .filter((card) => isTrainingCard(card))
    .slice(0, limit)
    .map((card, index) => sanitizeKnowledgeCard(card, index));

  const drillArticles = DRILL_LIBRARY_SEED.map((drill) => ({
    slug: `drill-${drill.slug}`,
    title: drill.name,
    content_type: "drill",
    category: drill.category,
    summary: `训练目标：${problemLabels(drill.related_problem_tag_ids).join("、") || "投篮基础动作"}`,
    default_dosage: drill.default_dosage,
    required_view: drill.required_view,
    student_visible_fields: ["title", "summary", "default_dosage", "required_view"],
    hidden_from_student: ["source_obsidian_path", "source_rule_cards", "raw_evidence_rules"]
  }));
  const filmingArticles = CAMERA_VIEWS.map((view) => ({
    slug: `filming-${view.id}`,
    title: `${view.label} 拍摄用途`,
    content_type: "filming_requirement",
    category: "filming_requirement",
    summary: filmingViewSummary(view.id),
    tags: [view.id, view.label.toLowerCase(), "拍摄视角"],
    student_visible_fields: ["title", "summary", "tags"]
  }));

  return {
    schema_version: "arc_lab_student_knowledge_directory.v1",
    source_contract: "student_clean_knowledge_directory_no_raw_sources",
    articles: [...filmingArticles, ...drillArticles, ...articleCards],
    student_visible: true,
    search_saves_student_question: false,
    hidden_from_student: [
      "source_url",
      "source_card_id",
      "source_card_path",
      "raw_rule_cards",
      "diagnosis_rules",
      "false_positives",
      "professional_evidence_rules"
    ]
  };
}

export function buildStudentKnowledgeAssistantResponse({
  question = "",
  knowledgeBase = {},
  ai_answer_count_today = 0,
  daily_limit = DEFAULT_DAILY_LIMIT
} = {}) {
  const classification = classifyStudentKnowledgeQuestion(question);
  const usage = {
    schema_version: "arc_lab_knowledge_assistant_usage_boundary.v1",
    saves_student_question: false,
    chat_history_written: false,
    question_log_visible_to_coach: false,
    daily_limit,
    ai_answer_count_today
  };

  if (!classification.allowed) {
    return {
      ok: false,
      schema_version: "arc_lab_student_knowledge_assistant_response.v1",
      source_contract: "general_knowledge_only_no_personal_video_diagnosis",
      classification,
      usage,
      answer_type: "boundary_refusal",
      message: "个人视频结论需要由教练结合视频复盘确认。这里可以帮你了解训练动作、投篮概念或拍摄要求。",
      student_visible_references: [],
      hidden_from_student: ["raw_ai_diagnosis", "ai_final_judgment", "source_card_ids"]
    };
  }

  if (ai_answer_count_today >= daily_limit) {
    return {
      ok: false,
      schema_version: "arc_lab_student_knowledge_assistant_response.v1",
      source_contract: "general_knowledge_only_no_personal_video_diagnosis",
      classification,
      usage,
      answer_type: "rate_limited",
      message: "今天的 AI 解释次数已用完。知识目录仍可继续浏览。",
      student_visible_references: []
    };
  }

  const references = retrieveStudentKnowledgeArticles(question, knowledgeBase, { limit: DEFAULT_RAG_LIMIT });
  return {
    ok: true,
    schema_version: "arc_lab_student_knowledge_assistant_response.v1",
    source_contract: "general_knowledge_only_no_personal_video_diagnosis",
    classification,
    usage: {
      ...usage,
      ai_answer_count_after_response: ai_answer_count_today + 1
    },
    answer_type: "general_training_explanation_draft",
    message: buildGroundedAnswerMessage(classification.category, references),
    student_visible_references: references,
    rag: {
      retrieval_method: "hybrid_lexical_v1",
      retrieved_count: references.length,
      generation_mode: "local_grounded"
    },
    hidden_from_student: buildStudentKnowledgeDirectory(knowledgeBase, { limit: 0 }).hidden_from_student
  };
}

export function retrieveStudentKnowledgeArticles(question = "", knowledgeBase = {}, { limit = DEFAULT_RAG_LIMIT } = {}) {
  const safeLimit = Math.max(1, Number(limit) || DEFAULT_RAG_LIMIT);
  const directory = buildStudentKnowledgeDirectory(knowledgeBase, { limit: Number.MAX_SAFE_INTEGER });
  const tokens = retrievalTokens(question);
  const ranked = directory.articles
    .map((article, index) => ({ article, index, ...scoreArticle(article, tokens) }))
    .filter((candidate) => candidate.score > 0 && (tokens.length <= 2 || candidate.matchedTokenCount >= 2))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, safeLimit)
    .map(({ article }) => article);

  return ranked;
}

export function summarizeArcLabKnowledgeAssistantContract() {
  return {
    schema_version: ARC_LAB_KNOWLEDGE_ASSISTANT_SCHEMA_VERSION,
    source_contract: "student_training_knowledge_assistant_local_contract_not_chat_history",
    can_answer_general_training_questions: true,
    personal_video_diagnosis_allowed: false,
    saves_student_questions: false,
    chat_history_in_mvp: false,
    question_log_visible_to_coach: false,
    exposes_raw_source_cards_to_students: false,
    retrieval_augmented_generation: true,
    retrieval_method: "hybrid_lexical_v1",
    default_daily_ai_answer_limit: DEFAULT_DAILY_LIMIT
  };
}

export function validateArcLabKnowledgeAssistantContract(knowledgeBase = {}) {
  const errors = [];
  const summary = summarizeArcLabKnowledgeAssistantContract();
  const directory = buildStudentKnowledgeDirectory(knowledgeBase);
  const personal = buildStudentKnowledgeAssistantResponse({
    question: "帮我分析我的投篮视频有什么问题",
    knowledgeBase,
    ai_answer_count_today: 0
  });
  const general = buildStudentKnowledgeAssistantResponse({
    question: "怎么拍 side view 投篮视频",
    knowledgeBase,
    ai_answer_count_today: 0
  });
  const limited = buildStudentKnowledgeAssistantResponse({
    question: "低位到高位起球怎么做",
    knowledgeBase,
    ai_answer_count_today: DEFAULT_DAILY_LIMIT
  });

  if (summary.personal_video_diagnosis_allowed !== false) errors.push("student knowledge assistant must not diagnose personal videos");
  if (summary.saves_student_questions !== false) errors.push("student knowledge assistant must not save student questions");
  if (summary.chat_history_in_mvp !== false) errors.push("student knowledge assistant must not write chat history in MVP");
  if (personal.ok !== false || personal.answer_type !== "boundary_refusal") {
    errors.push("personal video diagnosis question must be refused");
  }
  if (personal.usage.saves_student_question !== false || personal.usage.question_log_visible_to_coach !== false) {
    errors.push("personal diagnosis refusal must not save or expose the student question");
  }
  if (general.ok !== true || general.classification.allowed !== true) {
    errors.push("general training knowledge question should be allowed");
  }
  if (limited.answer_type !== "rate_limited") {
    errors.push("AI explanation should respect the daily answer limit");
  }
  for (const article of directory.articles) {
    for (const forbiddenField of ["id", "source_url", "source_card_path", "diagnosis_rules", "false_positives", "core_rules"]) {
      if (Object.hasOwn(article, forbiddenField)) {
        errors.push(`student article exposes forbidden field: ${forbiddenField}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_knowledge_assistant_validation.v1",
    summary,
    checks: {
      clean_article_count: directory.articles.length,
      personal_diagnosis_answer_type: personal.answer_type,
      general_answer_type: general.answer_type,
      rate_limit_answer_type: limited.answer_type
    },
    errors
  };
}

function isTrainingCard(card = {}) {
  const summary = String(card.summary || "");
  if (/无法提取|不包含投篮技术|不涉及投篮技术|not_stated/i.test(summary)) return false;
  const searchable = [
    card.title,
    card.summary,
    ...(Array.isArray(card.tags) ? card.tags : []),
    ...(Array.isArray(card.use_cases) ? card.use_cases : [])
  ].join(" ").toLowerCase();
  return searchable.includes("shooting")
    || searchable.includes("投篮")
    || searchable.includes("训练")
    || searchable.includes("drill");
}

function sanitizeKnowledgeCard(card, index) {
  return {
    slug: `knowledge-${index + 1}`,
    title: cleanText(card.title || "投篮知识"),
    content_type: "knowledge_article",
    summary: cleanText(card.summary || "训练知识条目"),
    tags: Array.isArray(card.tags) ? card.tags.filter(isStudentSafeTag).slice(0, 5) : [],
    student_visible_fields: ["title", "summary", "tags"]
  };
}

function isStudentSafeTag(tag) {
  return typeof tag === "string" && !/source|card|diagnosis|false|raw/i.test(tag);
}

function cleanText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/douyin[_:/\-\w.]*/gi, "")
    .replace(/source[_\s-]?card[_\s-]?id/gi, "")
    .trim();
}

function problemLabels(tagIds = []) {
  return tagIds
    .map((tagId) => PROBLEM_TAGS.find((tag) => tag.id === tagId)?.label_zh)
    .filter(Boolean);
}

function filmingViewSummary(viewId) {
  if (viewId === "side") return "侧面视角主要用于观察起球时序、下肢时序、膝角、躯干前倾和出手高度。";
  if (viewId === "front") return "正面视角主要用于观察手肘外翻、球路左右偏移、辅助手干扰和肩肘腕力线。";
  return "背面视角主要用于观察出手方向、球路方向、站位方向和投篮力线一致性。";
}

function buildGroundedAnswerMessage(category, references) {
  if (!references.length) {
    return "当前知识库没有检索到足够依据。你可以换一个更具体的训练动作或投篮概念提问。";
  }
  const evidence = references.slice(0, 2).map((reference) => `${reference.title}：${reference.summary}`).join("；");
  const boundary = category === "filming_requirement"
    ? "拍摄时仍应按训练任务指定的视角执行。"
    : "这些是通用训练知识，不构成对个人视频的诊断。";
  return `根据知识库中与问题最相关的内容，${evidence}。${boundary}`;
}

function scoreArticle(article, tokens) {
  if (!tokens.length) return { score: 0, matchedTokenCount: 0 };
  const title = normalizeSearchText(article.title);
  const summary = normalizeSearchText(article.summary);
  const tags = normalizeSearchText((article.tags || []).join(" "));
  let score = 0;
  let matchedTokenCount = 0;
  for (const token of tokens) {
    const tokenScore = (title.includes(token) ? 5 : 0)
      + (summary.includes(token) ? 3 : 0)
      + (tags.includes(token) ? 2 : 0);
    if (tokenScore > 0) matchedTokenCount += 1;
    score += tokenScore;
  }
  return { score, matchedTokenCount };
}

function retrievalTokens(value) {
  const normalized = normalizeSearchText(value);
  const tokens = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+/g) || []);
  const stopTokens = new Set(["怎么", "如何", "什么", "为什么", "是否", "可以", "需要", "一下", "请问", "中的", "意思", "投篮", "训练", "视频"]);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const token = run.slice(index, index + size);
        if (!stopTokens.has(token)) tokens.add(token);
      }
    }
  }
  return [...tokens];
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu, " ").trim();
}
