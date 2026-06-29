export const LOCAL_RAG_INDEX_SCHEMA_VERSION = "shooting_lab_local_rag_index.v1";

const DEFAULT_DIMENSIONS = 2048;
const DEFAULT_TOP_K = 5;

const STOP_TOKENS = new Set([
  "怎么",
  "如何",
  "什么",
  "为什么",
  "是否",
  "可以",
  "需要",
  "一下",
  "请问",
  "中的",
  "意思",
  "投篮",
  "训练",
  "视频",
  "动作",
  "问题",
  "知识",
  "知识库",
  "回答",
  "应该",
  "情况",
  "时候"
]);

export const DOMAIN_SYNONYM_GROUPS = [
  ["起球", "收球", "沉球", "抬球", "举球", "低手位", "低位", "高位", "自下而上", "ball_pickup", "shooting_pocket", "pickup"],
  ["手肘", "肘部", "肘", "肘外翻", "夹肘", "elbow", "elbow_flare"],
  ["手腕", "压腕", "拨球", "腕", "wrist", "wrist_snap"],
  ["辅助手", "护球手", "导向手", "扶球手", "guide_hand", "off_hand"],
  ["主视眼", "瞄准眼", "瞄准", "三点一线", "dominant_eye", "aiming"],
  ["球路", "出手线", "投篮线", "力线", "左右偏", "中线", "身体中线", "中路", "放球", "持球线", "哪条线", "ball_path", "shot_line", "alignment"],
  ["发力链", "动力链", "上下肢协同", "髋膝踝", "下肢发力", "power_chain", "lower_body_power"],
  ["髋", "曲髋", "髋部", "hip", "hip_hinge"],
  ["膝", "膝盖", "屈膝", "伸膝", "knee"],
  ["脚踝", "踝", "蹬伸", "踮脚", "ankle", "ankle_extension"],
  ["躯干", "前倾", "后仰", "核心稳定", "前跳", "向前跳", "重心前跳", "trunk", "trunk_lean", "core"],
  ["出手点", "出手高度", "释放点", "release", "release_height"],
  ["弧度", "投篮弧线", "弧线低", "arc", "trajectory"],
  ["节奏", "时序", "手快脚慢", "脚快手慢", "timing", "rhythm", "sequencing"],
  ["一段式", "二段式", "连贯发力", "停顿", "one_motion", "two_motion"],
  ["多角度", "单角度", "角度", "视角", "证据", "复核", "camera_view"],
  ["侧面", "侧视角", "side", "side_view"],
  ["正面", "正视角", "front", "front_view"],
  ["背面", "背视角", "back", "back_view"]
];

export function buildLocalRagIndex(knowledgeBase = {}, { dimensions = DEFAULT_DIMENSIONS } = {}) {
  const chunks = buildKnowledgeChunks(knowledgeBase);
  const documentTokens = chunks.map((chunk) => unique(tokenizeForRetrieval(chunk.search_text)));
  const documentFrequency = new Map();
  for (const tokens of documentTokens) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const indexedChunks = chunks.map((chunk, index) => ({
    ...publicChunk(chunk),
    vector: sparseTfIdfVector(tokenizeForRetrieval(chunk.search_text), documentFrequency, chunks.length, dimensions),
    token_count: documentTokens[index].length
  }));

  return {
    schema_version: LOCAL_RAG_INDEX_SCHEMA_VERSION,
    source_contract: "local_sparse_vector_rag_no_external_api",
    generated_at: new Date().toISOString(),
    dimensions,
    chunk_count: indexedChunks.length,
    chunks: indexedChunks
  };
}

export function buildKnowledgeChunks(knowledgeBase = {}) {
  const cards = Array.isArray(knowledgeBase.cards) ? knowledgeBase.cards : [];
  return cards
    .filter(isUsableTrainingCard)
    .map((card, index) => {
      const slug = `kb-${safeSlug(card.id || `card-${index + 1}`)}`;
      const rules = (card.diagnosis_rules || [])
        .filter(isUsableDiagnosisRule)
        .slice(0, 4)
        .map((rule) => ({
          if: cleanText(rule.if),
          then: cleanText(rule.then),
          check: cleanText(rule.check),
          repair: cleanText(rule.repair)
        }));
      const repairActions = (card.repair_actions || [])
        .filter((action) => action?.drill && action.drill !== "not_stated")
        .slice(0, 4)
        .map((action) => ({
          drill: cleanText(action.drill),
          dosage: cleanText(action.dosage),
          cue: cleanText(action.cue),
          success_metric: cleanText(action.success_metric)
        }));
      const tags = [
        ...(Array.isArray(card.tags) ? card.tags : []),
        ...(Array.isArray(card.motion_focus) ? card.motion_focus : []),
        ...(Array.isArray(card.app_modules) ? card.app_modules : [])
      ].filter(Boolean).slice(0, 16);
      const searchText = [
        card.title,
        card.summary,
        tags.join(" "),
        ...(card.observable_signals || []),
        ...(card.core_rules || []),
        ...rules.flatMap((rule) => [rule.if, rule.then, rule.check, rule.repair]),
        ...repairActions.flatMap((action) => [action.drill, action.dosage, action.cue, action.success_metric])
      ].join("\n");

      return {
        chunk_id: `chunk-${String(index + 1).padStart(4, "0")}`,
        slug,
        source_card_id: card.id,
        title: cleanText(card.title || "投篮知识卡"),
        summary: cleanText(card.summary || ""),
        tags: unique(tags.map(cleanText)).slice(0, 12),
        diagnosis_rules: rules,
        repair_actions: repairActions,
        search_text: cleanText(searchText)
      };
    });
}

export function retrieveLocalRag(query = "", index = {}, { topK = DEFAULT_TOP_K } = {}) {
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  const queryTokens = tokenizeForRetrieval(query);
  if (!hasDomainSignal(queryTokens)) return [];
  const queryVector = sparseTfIdfQueryVector(queryTokens, chunks, index.dimensions || DEFAULT_DIMENSIONS);
  return chunks
    .map((chunk) => ({
      ...publicChunk(chunk),
      score: cosineSparse(queryVector, chunk.vector || {})
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(1, Number(topK) || DEFAULT_TOP_K));
}

function hasDomainSignal(tokens) {
  const normalizedTokens = new Set(tokens.map(normalizeSearchText));
  return DOMAIN_SYNONYM_GROUPS.some((group) =>
    group.some((item) => normalizedTokens.has(normalizeSearchText(item)))
  );
}

export function buildGroundedPortfolioAnswer(question = "", matches = []) {
  if (!matches.length) {
    return {
      answer: "当前知识库依据不足，建议换一个更具体的投篮动作、发力链条或拍摄视角提问。",
      cited_slugs: [],
      confidence: "low",
      boundary: "knowledge_insufficient"
    };
  }
  const top = matches.slice(0, 2);
  const evidenceText = top.map((match) => {
    const repair = match.repair_actions?.[0]?.cue || match.diagnosis_rules?.[0]?.repair || "";
    return `${match.title}：${match.summary}${repair ? ` 建议提示：${repair}` : ""}`;
  }).join("；");
  return {
    answer: `针对“${String(question || "").trim()}”，知识库最相关的依据是：${evidenceText}。这属于通用训练知识，不构成对个人视频的最终诊断。`,
    cited_slugs: top.map((match) => match.slug),
    confidence: top[0]?.score >= 0.2 ? "medium" : "low",
    boundary: "general_training_only"
  };
}

function publicChunk(chunk) {
  return {
    chunk_id: chunk.chunk_id,
    slug: chunk.slug,
    source_card_id: chunk.source_card_id,
    title: chunk.title,
    summary: chunk.summary,
    tags: chunk.tags || [],
    diagnosis_rules: chunk.diagnosis_rules || [],
    repair_actions: chunk.repair_actions || []
  };
}

function sparseTfIdfQueryVector(tokens, chunks, dimensions) {
  const documentCount = chunks.length || 1;
  const documentFrequency = new Map();
  for (const chunk of chunks) {
    const occupied = new Set(Object.keys(chunk.vector || {}));
    for (const bucket of occupied) {
      documentFrequency.set(bucket, (documentFrequency.get(bucket) || 0) + 1);
    }
  }
  const counts = new Map();
  for (const token of tokens) {
    const bucket = String(hashToken(token, dimensions));
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const vector = {};
  for (const [bucket, count] of counts.entries()) {
    const df = documentFrequency.get(bucket) || 1;
    vector[bucket] = count * (Math.log((1 + documentCount) / (1 + df)) + 1);
  }
  return normalizeSparse(vector);
}

function sparseTfIdfVector(tokens, documentFrequency, documentCount, dimensions) {
  const counts = new Map();
  for (const token of tokens) {
    const bucket = hashToken(token, dimensions);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const vector = {};
  for (const [bucket, count] of counts.entries()) {
    const matchingTokenDf = Math.max(
      1,
      ...tokens
        .filter((token) => hashToken(token, dimensions) === bucket)
        .map((token) => documentFrequency.get(token) || 1)
    );
    vector[bucket] = count * (Math.log((1 + documentCount) / (1 + matchingTokenDf)) + 1);
  }
  return normalizeSparse(vector);
}

function cosineSparse(left = {}, right = {}) {
  let dot = 0;
  for (const [bucket, value] of Object.entries(left)) {
    dot += value * (right[bucket] || 0);
  }
  return Number(dot.toFixed(6));
}

function normalizeSparse(vector) {
  const norm = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0)) || 1;
  const normalized = {};
  for (const [key, value] of Object.entries(vector)) {
    const score = value / norm;
    if (score > 0) normalized[key] = Number(score.toFixed(6));
  }
  return normalized;
}

function tokenizeForRetrieval(value) {
  const normalized = normalizeSearchText(value);
  const tokens = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+/g) || []);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const token = run.slice(index, index + size);
        if (!STOP_TOKENS.has(token)) tokens.add(token);
      }
    }
  }
  return expandDomainSynonyms([...tokens].filter((token) => token.length > 1 && !STOP_TOKENS.has(token)));
}

function expandDomainSynonyms(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const group of DOMAIN_SYNONYM_GROUPS) {
      if (group.some((item) => normalizeSearchText(item) === token || normalizeSearchText(item).includes(token) || token.includes(normalizeSearchText(item)))) {
        for (const synonym of group) {
          for (const synonymToken of tokenizeLiteral(synonym)) {
            expanded.add(synonymToken);
          }
        }
      }
    }
  }
  return [...expanded];
}

function tokenizeLiteral(value) {
  const normalized = normalizeSearchText(value);
  return [
    normalized,
    ...(normalized.match(/[a-z0-9][a-z0-9_-]+/g) || []),
    ...(normalized.match(/[\p{Script=Han}]+/gu) || [])
  ].filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function hashToken(token, dimensions) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % dimensions;
}

function isUsableTrainingCard(card = {}) {
  const summary = `${card.title || ""} ${card.summary || ""}`;
  if (/无法提取|不包含投篮技术|不涉及投篮技术|未涉及投篮技术|未讨论投篮问题|不适用于投篮分析/i.test(summary)) return false;
  return (card.diagnosis_rules || []).some(isUsableDiagnosisRule)
    || (card.repair_actions || []).some((action) => action?.drill && action.drill !== "not_stated");
}

function isUsableDiagnosisRule(rule = {}) {
  const text = `${rule.if || ""} ${rule.then || ""} ${rule.repair || ""}`;
  return Boolean(text.trim()) && !/无法提取|不包含投篮技术|not_stated/i.test(text);
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu, " ").trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSlug(value) {
  return String(value || "knowledge")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "knowledge";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
