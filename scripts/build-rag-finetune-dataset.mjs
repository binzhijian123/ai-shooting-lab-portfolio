import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFineTuneDatasetFromIndex,
  splitFineTuneExamples,
  toMlxChatRecord
} from "../server/localFineTuneData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "data", "rag", "local_rag_index.json");
const outputDir = path.join(root, "data", "finetune", "shooting-rag-json");
const maxExamples = Number(process.argv.find((arg) => arg.startsWith("--max="))?.slice("--max=".length) || 240);

const index = JSON.parse(await readFile(indexPath, "utf8"));
const dataset = buildFineTuneDatasetFromIndex(index, { maxExamples });
const split = splitFineTuneExamples(dataset.examples);

await mkdir(outputDir, { recursive: true });
await writeJsonl(path.join(outputDir, "train.jsonl"), split.train.map(toMlxChatRecord));
await writeJsonl(path.join(outputDir, "valid.jsonl"), split.valid.map(toMlxChatRecord));
await writeJsonl(path.join(outputDir, "test.jsonl"), split.test.map(toMlxChatRecord));
await writeFile(path.join(outputDir, "dataset_summary.json"), `${JSON.stringify({
  schema_version: dataset.schema_version,
  source_contract: dataset.source_contract,
  output_dir: path.relative(root, outputDir),
  examples: dataset.example_count,
  split_counts: {
    train: split.train.length,
    valid: split.valid.length,
    test: split.test.length
  },
  first_train_example: toMlxChatRecord(split.train[0])
}, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  schema_version: "build_rag_finetune_dataset_result.v1",
  output_dir: path.relative(root, outputDir),
  examples: dataset.example_count,
  train: split.train.length,
  valid: split.valid.length,
  test: split.test.length
}, null, 2));

async function writeJsonl(filePath, records) {
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}
