import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVectorRagIndex } from "../server/vectorRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const knowledgeBasePath = path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json");
const outputDir = path.join(root, "data", "rag");
const outputPath = path.join(outputDir, "vector_index.json");
const model = args.model || process.env.RAG_EMBED_MODEL || "BAAI/bge-small-zh-v1.5";

const knowledgeBase = JSON.parse(await readFile(knowledgeBasePath, "utf8"));
const index = await buildVectorRagIndex(knowledgeBase, {
  root,
  model,
  pythonPath: args.python,
  batchSize: Number(args.batchSize || 16)
});

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  schema_version: "build_vector_rag_index_result.v1",
  output_path: path.relative(root, outputPath),
  source_cards: Array.isArray(knowledgeBase.cards) ? knowledgeBase.cards.length : 0,
  indexed_chunks: index.chunk_count,
  embedding_model: index.embedding_model,
  embedding_dimension: index.embedding_dimension,
  retrieval_method: index.source_contract
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg.startsWith("--model=")) parsed.model = arg.slice("--model=".length);
    else if (arg.startsWith("--python=")) parsed.python = arg.slice("--python=".length);
    else if (arg.startsWith("--batch-size=")) parsed.batchSize = arg.slice("--batch-size=".length);
  }
  return parsed;
}
