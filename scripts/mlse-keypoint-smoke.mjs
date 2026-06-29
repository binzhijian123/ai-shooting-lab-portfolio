import assert from "node:assert/strict";
import {
  buildMlseKeypointCalculation,
  buildMlseKeypointCalculationFromJson,
  parseMlseTrialJson
} from "../server/mlseKeypointEngine.mjs";

const frames = [0, 1, 2].map((frame) => ({
  frame,
  time: frame * 16.6667,
  data: {
    ball: [0.2 + frame * 0.7, 0, 2 + frame * 0.15],
    player: {
      LEFT_SHOULDER: [-1, 0, 2], RIGHT_SHOULDER: [1, 0, 2],
      LEFT_ELBOW: [-1.2, 0, 1.4], RIGHT_ELBOW: [1.2, 0, 1.4],
      LEFT_WRIST: [-1.1, 0, 0.8], RIGHT_WRIST: [0.3, 0, 0.8],
      LEFT_HIP: [-1, 0, 1], RIGHT_HIP: [1, 0, 1],
      LEFT_KNEE: [-0.4, 0, 0.4], RIGHT_KNEE: [1.6, 0, 0.4],
      LEFT_ANKLE: [-0.4, 0, 0], RIGHT_ANKLE: [1.6, 0, 0],
      LEFT_BIG_TOE: [0.2, 0, 0], RIGHT_BIG_TOE: [2.2, 0, 0],
      LEFT_HEEL: [-0.9, 0, 0], RIGHT_HEEL: [1.1, 0, 0],
      LEFT_THIRD_FINGER_MCP: [-1.1, 0, 0.3], RIGHT_THIRD_FINGER_MCP: [0.8, 0, 0.3]
    }
  }
}));

const trial = {
  sampling_rate: 60,
  participant_id: "synthetic",
  trial_id: "T0001",
  result: "made",
  tracking: frames
};
const output = buildMlseKeypointCalculation(trial, { shooting_side: "right" });

assert.equal(output.shooting_side.status, "provided");
assert.equal(output.quality.total_frames, 3);
assert.equal(output.angle_summary.knee_flexion_extension_deg.valid_frames, 3);
assert.equal(output.angle_summary.ankle_dorsi_plantar_flexion_deg.valid_frames, 3);
assert.equal(output.angle_summary.wrist_flexion_extension_deg.valid_frames, 3);
assert.ok(output.frame_series.every((frame) => Number.isFinite(frame.angles.elbow_flexion_extension_deg)));
assert.ok(output.frame_series.every((frame) => Number.isFinite(frame.ball_to_shooting_wrist_ft)));

const rawWithNaN = JSON.stringify(trial).replace("[0.2,0,2]", "[NaN,0,2]");
const parsed = parseMlseTrialJson(rawWithNaN);
assert.equal(parsed.parse_quality.status, "parsed_with_missing_values");
assert.equal(parsed.trial.tracking[0].data.ball[0], null);
const parsedOutput = buildMlseKeypointCalculation(parsed.trial, { shooting_side: "right" });
assert.equal(parsedOutput.quality.keypoint_coverage.ball.valid_frames, 2);
assert.equal(parsedOutput.frame_series[0].ball, null);

const missingWrist = structuredClone(trial);
for (const frame of missingWrist.tracking) frame.data.player.RIGHT_THIRD_FINGER_MCP = [NaN, 0, 0];
const missingOutput = buildMlseKeypointCalculation(missingWrist, { shooting_side: "right" });
assert.equal(missingOutput.angle_summary.wrist_flexion_extension_deg.valid_frames, 0);

const fromJson = buildMlseKeypointCalculationFromJson(JSON.stringify(trial), { shooting_side: "right" });
assert.equal(fromJson.trial.participant_id, "synthetic");

console.log(JSON.stringify({
  ok: true,
  checked: [
    "3d_angle_series",
    "ankle_and_wrist_keypoint_requirements",
    "non_finite_json_tolerance",
    "missing_wrist_is_not_fabricated",
    "research_only_contract"
  ]
}, null, 2));
