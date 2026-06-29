import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelPrompt } from "../server/localFineTuneData.mjs";
import { retrieveLocalRag } from "../server/localRagIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "data", "finetune", "shooting-rag-json");
const promptPath = path.join(outputDir, "latest_prompt.txt");
const referencesPath = path.join(outputDir, "latest_references.json");
const index = JSON.parse(await readFile(path.join(root, "data", "rag", "local_rag_index.json"), "utf8"));
const question = process.argv.slice(2).join(" ").trim() || "低位到高位起球怎么做？";
const references = retrieveLocalRag(question, index, { topK: 3 });
const prompt = buildModelPrompt(question, references);

await mkdir(outputDir, { recursive: true });
await writeFile(promptPath, prompt);
await writeFile(referencesPath, `${JSON.stringify({ question, references }, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  schema_version: "prepare_rag_lora_prompt_result.v1",
  question,
  prompt_path: path.relative(root, promptPath),
  references_path: path.relative(root, referencesPath),
  reference_slugs: references.map((reference) => reference.slug)
}, null, 2));
