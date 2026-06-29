import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLocalRagIndex } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const knowledgeBasePath = path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json");
const outputDir = path.join(root, "data", "rag");
const outputPath = path.join(outputDir, "local_rag_index.json");

const knowledgeBase = JSON.parse(await readFile(knowledgeBasePath, "utf8"));
const index = buildLocalRagIndex(knowledgeBase);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  schema_version: "build_local_rag_index_result.v1",
  output_path: path.relative(root, outputPath),
  source_cards: Array.isArray(knowledgeBase.cards) ? knowledgeBase.cards.length : 0,
  indexed_chunks: index.chunk_count,
  retrieval_method: index.source_contract
}, null, 2));
