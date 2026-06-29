import { spawn } from "node:child_process";
import path from "node:path";
import { buildKnowledgeChunks, DOMAIN_SYNONYM_GROUPS } from "./localRagIndex.mjs";

export const VECTOR_RAG_INDEX_SCHEMA_VERSION = "shooting_lab_vector_rag_index.v1";

const DEFAULT_TOP_K = 5;
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5";
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.35;

const DOMAIN_SIGNAL_TERMS = [
  "起球",
  "收球",
  "沉球",
  "手肘",
  "肘",
  "手腕",
  "压腕",
  "拨球",
  "辅助手",
  "主视眼",
  "瞄准",
  "球路",
  "力线",
  "发力",
  "下肢",
  "髋",
  "膝",
  "脚踝",
  "躯干",
  "核心",
  "出手",
  "弧线",
  "弧度",
  "节奏",
  "时序",
  "一段式",
  "二段式",
  "侧面",
  "正面",
  "背面",
  "重心",
  "前倾",
  "跳投",
  "三分",
  "近筐"
];

export async function buildVectorRagIndex(knowledgeBase = {}, {
  root = process.cwd(),
  model = DEFAULT_EMBEDDING_MODEL,
  pythonPath = defaultPythonPath(root),
  batchSize = 16
} = {}) {
  const chunks = buildKnowledgeChunks(knowledgeBase);
  const texts = chunks.map(buildVectorDocumentText);
  const embeddingResult = await embedTexts(texts, {
    root,
    model,
    mode: "document",
    pythonPath,
    batchSize
  });

  const indexedChunks = chunks.map((chunk, index) => ({
    ...publicChunk(chunk),
    search_text: chunk.search_text,
    embedding: embeddingResult.embeddings[index]
  }));

  return {
    schema_version: VECTOR_RAG_INDEX_SCHEMA_VERSION,
    source_contract: "local_embedding_vector_rag_json_index",
    generated_at: new Date().toISOString(),
    embedding_model: embeddingResult.model,
    embedding_dimension: embeddingResult.dimension,
    chunk_count: indexedChunks.length,
    low_confidence_threshold: DEFAULT_LOW_CONFIDENCE_THRESHOLD,
    chunks: indexedChunks
  };
}

export async function retrieveVectorRag(query = "", index = {}, {
  root = process.cwd(),
  topK = DEFAULT_TOP_K,
  model = index.embedding_model || DEFAULT_EMBEDDING_MODEL,
  pythonPath = defaultPythonPath(root),
  lowConfidenceThreshold = index.low_confidence_threshold || DEFAULT_LOW_CONFIDENCE_THRESHOLD
} = {}) {
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  if (!chunks.length || !hasVectorDomainSignal(query)) return [];

  const embeddingResult = await embedTexts([query], {
    root,
    model,
    mode: "query",
    pythonPath,
    batchSize: 1
  });
  const queryEmbedding = embeddingResult.embeddings[0] || [];

  return rankVectorRagMatches(queryEmbedding, index, { topK, lowConfidenceThreshold });
}

export function rankVectorRagMatches(queryEmbedding = [], index = {}, {
  topK = DEFAULT_TOP_K,
  lowConfidenceThreshold = index.low_confidence_threshold || DEFAULT_LOW_CONFIDENCE_THRESHOLD
} = {}) {
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  return chunks
    .map((chunk) => ({
      ...publicChunk(chunk),
      score: dotProduct(queryEmbedding, chunk.embedding || [])
    }))
    .filter((match) => match.score >= lowConfidenceThreshold)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(1, Number(topK) || DEFAULT_TOP_K));
}

export function buildVectorDocumentText(chunk = {}) {
  return [
    `标题：${chunk.title || ""}`,
    `摘要：${chunk.summary || ""}`,
    `标签：${(chunk.tags || []).join(" ")}`,
    "诊断规则：",
    ...(chunk.diagnosis_rules || []).flatMap((rule) => [
      `如果：${rule.if || ""}`,
      `那么：${rule.then || ""}`,
      `检查：${rule.check || ""}`,
      `修复：${rule.repair || ""}`
    ]),
    "训练动作：",
    ...(chunk.repair_actions || []).flatMap((action) => [
      `练习：${action.drill || ""}`,
      `剂量：${action.dosage || ""}`,
      `提示：${action.cue || ""}`,
      `成功标准：${action.success_metric || ""}`
    ])
  ].join("\n").replace(/\s+/g, " ").trim();
}

export async function embedTexts(texts = [], {
  root = process.cwd(),
  model = DEFAULT_EMBEDDING_MODEL,
  mode = "document",
  pythonPath = defaultPythonPath(root),
  batchSize = 16
} = {}) {
  if (!texts.length) {
    return { ok: true, model, mode, dimension: 0, embeddings: [] };
  }

  const scriptPath = path.join(root, "scripts", "embed-texts.py");
  const args = [
    scriptPath,
    "--model",
    model,
    "--mode",
    mode,
    "--local-files-only",
    "--batch-size",
    String(batchSize)
  ];
  const result = await runPythonJson(pythonPath, args, { texts });
  if (!result.ok || !Array.isArray(result.embeddings)) {
    throw new Error(`Embedding script returned invalid result for mode=${mode}`);
  }
  return result;
}

function runPythonJson(pythonPath, args, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Embedding script failed with code ${code}: ${stderr.slice(-1200)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Embedding script emitted invalid JSON: ${error.message}\n${stdout.slice(0, 500)}\n${stderr.slice(-500)}`));
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

function publicChunk(chunk = {}) {
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

function dotProduct(left = [], right = []) {
  const limit = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < limit; index += 1) {
    sum += Number(left[index] || 0) * Number(right[index] || 0);
  }
  return Number(sum.toFixed(6));
}

export function hasVectorDomainSignal(query = "") {
  const normalized = normalizeText(query);
  const strongHit = DOMAIN_SIGNAL_TERMS.some((term) => normalized.includes(normalizeText(term)));
  if (strongHit) return true;
  return DOMAIN_SYNONYM_GROUPS.some((group) =>
    group.some((term) => normalized.includes(normalizeText(term)) && normalizeText(term) !== "投篮")
  );
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu, " ").trim();
}

function defaultPythonPath(root) {
  return process.env.RAG_EMBED_PYTHON || path.join(root, ".venv-rag-finetune", "bin", "python");
}
