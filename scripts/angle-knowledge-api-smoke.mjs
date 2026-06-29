import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = 4300 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await waitForServer();
  const summaryResponse = await fetch(`${baseUrl}/api/body-angle-problem-mapping`);
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.schema_version, "body_angle_problem_mapping.v1");
  assert.equal(summary.angle_count, 8);
  assert.equal(summary.observation_count, 22);
  assert.equal(summary.problem_mapping_count, 13);

  const retrievalResponse = await fetch(`${baseUrl}/api/angle-knowledge-retrieval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      observations: [
        { observation_id: "timing.ball_lift_precedes_lower_body", status: "candidate", confidence: 0.84 },
        { observation_id: "elbow.extension_onset_early", status: "candidate", confidence: 0.78 },
        { observation_id: "output.release_height_low", status: "candidate", confidence: 0.72 }
      ],
      context: {
        camera_views: ["side"],
        shot_type: "定点三分",
        distance_band: "three_point",
        valid_attempt_count: 10,
        repeatability_ratio: 0.7,
        human_reviewed: false
      }
    })
  });
  assert.equal(retrievalResponse.status, 200);
  const retrieval = await retrievalResponse.json();
  const match = retrieval.matches.find((item) => item.problem_id === "problem.upper_body_rush_early_lift");
  assert.ok(match);
  assert.equal(match.status, "supported_pattern");
  assert.equal(match.diagnosis_allowed, false);
  assert.deepEqual(match.evidence_families.sort(), ["coordination", "output"]);
  assert.ok(match.knowledge_matches.length > 0);
  assert.ok(match.knowledge_matches[0].source_card_id);
  assert.ok(match.knowledge_matches[0].matched_terms.length > 0);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "angle_knowledge_api_smoke.v1",
    mapping_summary: {
      angle_count: summary.angle_count,
      observation_count: summary.observation_count,
      problem_mapping_count: summary.problem_mapping_count
    },
    retrieval: {
      problem_id: match.problem_id,
      status: match.status,
      diagnosis_allowed: match.diagnosis_allowed,
      top_card_id: match.knowledge_matches[0].source_card_id,
      matched_terms: match.knowledge_matches[0].matched_terms
    }
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited before readiness\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/body-angle-problem-mapping`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready\n${output}`);
}
