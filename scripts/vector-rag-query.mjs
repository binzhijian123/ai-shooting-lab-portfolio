import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGroundedPortfolioAnswer } from "../server/localRagIndex.mjs";
import { retrieveVectorRag } from "../server/vectorRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const indexPath = path.join(root, "data", "rag", "vector_index.json");
const question = args._.join(" ").trim() || "低位到高位起球怎么做？";
const topK = Number(args.topK || 5);

const index = JSON.parse(await readFile(indexPath, "utf8"));
const matches = await retrieveVectorRag(question, index, {
  root,
  topK,
  pythonPath: args.python,
  lowConfidenceThreshold: args.threshold ? Number(args.threshold) : undefined
});
const answer = buildGroundedPortfolioAnswer(question, matches);

console.log(JSON.stringify({
  ok: true,
  schema_version: "vector_rag_query_result.v1",
  question,
  retrieval: {
    method: index.source_contract,
    embedding_model: index.embedding_model,
    threshold: args.threshold ? Number(args.threshold) : index.low_confidence_threshold,
    top_k: matches.length,
    matches: matches.map((match) => ({
      slug: match.slug,
      score: match.score,
      title: match.title,
      summary: match.summary,
      tags: match.tags.slice(0, 6)
    }))
  },
  answer
}, null, 2));

function parseArgs(argv) {
  const parsed = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith("--topK=")) parsed.topK = arg.slice("--topK=".length);
    else if (arg.startsWith("--threshold=")) parsed.threshold = arg.slice("--threshold=".length);
    else if (arg.startsWith("--python=")) parsed.python = arg.slice("--python=".length);
    else parsed._.push(arg);
  }
  return parsed;
}
