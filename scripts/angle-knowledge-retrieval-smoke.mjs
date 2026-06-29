import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAngleKnowledgeRetrieval } from "../server/angleKnowledgeRetrieval.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "distillation", "douyin-shooting-coach", "outputs");
const mapping = JSON.parse(await readFile(path.join(outputDir, "body_angle_problem_mapping.json"), "utf8"));
const knowledgeBase = JSON.parse(await readFile(path.join(outputDir, "knowledge_base.json"), "utf8"));

const earlyLift = buildAngleKnowledgeRetrieval({
  mapping,
  knowledgeBase,
  observations: [
    {
      observation_id: "timing.ball_lift_precedes_lower_body",
      status: "candidate",
      confidence: 0.84,
      metric_ids: ["ball_lift_minus_lower_body_onset_ms"],
      baseline_source: "within_attempt_signed_event_order",
      source_view: "side"
    },
    {
      observation_id: "elbow.extension_onset_early",
      status: "candidate",
      confidence: 0.78,
      metric_ids: ["elbow_extension_minus_ball_lift_ms"],
      baseline_source: "personal_same_shot_context",
      source_view: "side"
    },
    {
      observation_id: "output.release_height_low",
      status: "candidate",
      confidence: 0.72,
      metric_ids: ["release_height_ratio"],
      baseline_source: "personal_same_shot_context",
      source_view: "side"
    }
  ],
  context: {
    camera_views: ["side"],
    shot_type: "定点三分",
    distance_band: "three_point",
    valid_attempt_count: 10,
    repeatability_ratio: 0.7,
    human_reviewed: false
  }
});

const earlyLiftMatch = earlyLift.matches.find((match) => match.problem_id === "problem.upper_body_rush_early_lift");
assert.ok(earlyLiftMatch, "early-lift problem mapping must be returned");
assert.equal(earlyLiftMatch.status, "supported_pattern");
assert.equal(earlyLiftMatch.diagnosis_allowed, false, "human review is required for confirmed diagnosis");
assert.ok(earlyLiftMatch.knowledge_matches.length > 0, "early-lift mapping must retrieve knowledge cards");
assert.ok(
  earlyLiftMatch.knowledge_matches.some((match) => match.matched_terms.some((term) => /手快脚慢|上下肢脱节|蹬地同时起球/.test(term))),
  "retrieval must explain which timing problem terms matched"
);

const singleAngle = buildAngleKnowledgeRetrieval({
  mapping,
  knowledgeBase,
  observations: [
    {
      observation_id: "trunk.forward_lean_increase",
      status: "candidate",
      confidence: 0.82,
      metric_ids: ["trunk_lean_change_deg"],
      baseline_source: "personal_same_shot_context",
      source_view: "side"
    }
  ],
  context: {
    camera_views: ["side"],
    shot_type: "定点三分",
    valid_attempt_count: 10,
    repeatability_ratio: 0.8
  }
});

const trunkMatch = singleAngle.matches.find((match) => match.problem_id === "problem.forward_trunk_drift_low_release");
assert.ok(trunkMatch, "single trunk observation should expose the related problem mapping");
assert.equal(trunkMatch.status, "observed", "a single angle observation must not become a candidate problem");
assert.equal(trunkMatch.candidate_allowed, false);

const missingFront = buildAngleKnowledgeRetrieval({
  mapping,
  knowledgeBase,
  observations: [
    { observation_id: "forearm.lateral_deviation", status: "candidate", confidence: 0.8 },
    { observation_id: "output.ball_path_lateral_deviation", status: "candidate", confidence: 0.75 }
  ],
  context: {
    camera_views: ["side"],
    shot_type: "定点三分",
    repeatability_ratio: 0.7
  }
});

const lineMatch = missingFront.matches.find((match) => match.problem_id === "problem.elbow_forearm_line_deviation");
assert.ok(lineMatch, "upper-body line mapping must be returned for audit");
assert.equal(lineMatch.status, "not_judgable", "missing front view must block lateral line judgement");
assert.deepEqual(lineMatch.knowledge_matches, [], "not-judgable mappings must not retrieve diagnosis cards");

const reviewed = buildAngleKnowledgeRetrieval({
  mapping,
  knowledgeBase,
  observations: [
    { observation_id: "timing.ball_lift_precedes_lower_body", status: "candidate", confidence: 0.84 },
    { observation_id: "elbow.extension_onset_early", status: "candidate", confidence: 0.78 },
    { observation_id: "output.release_height_low", status: "candidate", confidence: 0.72 }
  ],
  context: {
    camera_views: ["side"],
    shot_type: "定点三分",
    valid_attempt_count: 10,
    repeatability_ratio: 0.7,
    human_reviewed: true
  }
});
assert.equal(
  reviewed.matches.find((match) => match.problem_id === "problem.upper_body_rush_early_lift")?.diagnosis_allowed,
  true,
  "supported repeatable pattern can become diagnosis-allowed only after human review"
);

console.log(JSON.stringify({
  ok: true,
  schema_version: "angle_knowledge_retrieval_smoke.v1",
  early_lift_status: earlyLiftMatch.status,
  early_lift_top_card: earlyLiftMatch.knowledge_matches[0]?.source_card_id || null,
  single_angle_status: trunkMatch.status,
  missing_front_status: lineMatch.status,
  human_review_gate: true
}, null, 2));
