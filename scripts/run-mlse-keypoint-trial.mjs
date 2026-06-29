import { readFile, writeFile } from "node:fs/promises";
import {
  buildMlseKeypointCalculationFromJson,
  MLSE_KEYPOINT_CONTRACT
} from "../server/mlseKeypointEngine.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error("Usage: node scripts/run-mlse-keypoint-trial.mjs --input /absolute/path/trial.json [--side left|right] [--output /tmp/result.json]");
  process.exit(1);
}

const rawTrial = await readFile(args.input, "utf8");
const result = buildMlseKeypointCalculationFromJson(rawTrial, { shooting_side: args.side });

if (args.output) {
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  contract: MLSE_KEYPOINT_CONTRACT,
  trial: result.trial,
  parse_quality: result.parse_quality,
  shooting_side: result.shooting_side,
  quality: result.quality,
  angle_summary: result.angle_summary,
  release_candidate: result.release_candidate,
  full_output_written_to: args.output || null
}, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (key === "--input") parsed.input = value;
    if (key === "--side" && (value === "left" || value === "right")) parsed.side = value;
    if (key === "--output") parsed.output = value;
  }
  return parsed;
}
