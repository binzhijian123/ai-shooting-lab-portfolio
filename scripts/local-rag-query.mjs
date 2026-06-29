import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGroundedPortfolioAnswer, retrieveLocalRag } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "data", "rag", "local_rag_index.json");
const question = process.argv.slice(2).join(" ").trim() || "低位到高位起球怎么做？";

const index = JSON.parse(await readFile(indexPath, "utf8"));
const matches = retrieveLocalRag(question, index, { topK: 5 });
const answer = buildGroundedPortfolioAnswer(question, matches);

console.log(JSON.stringify({
  ok: true,
  schema_version: "local_rag_query_result.v1",
  question,
  retrieval: {
    method: index.source_contract,
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
