import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSampleManifestPolicy } from "../server/sampleManifestPolicy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "data", "sample_manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const result = await validateSampleManifestPolicy(manifest, root);

if (result.errors.length) {
  console.error(JSON.stringify({
    ok: false,
    schema_version: "sample_manifest_smoke.v1",
    errors: result.errors,
    sample_manifest: result.summary
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "sample_manifest_smoke.v1",
  source_contract: "authorized_local_synthetic_samples_only",
  sample_count: result.summary.sample_count,
  privacy_boundary: result.summary.privacy_boundary,
  samples: result.summary.samples.map((sample) => ({
    id: sample.id,
    source_type: sample.source_type,
    camera_view: sample.camera_view,
    fps: sample.fps,
    duration_ms: sample.duration_ms,
    dimensions: sample.dimensions,
    bytes: sample.bytes,
    diagnosis_confidence: sample.diagnosis_confidence
  })),
  boundaries: [
    "manifest_authorized_local_acceptance_only",
    "synthetic_samples_not_player_diagnosis",
    "real_school_team_video_not_present",
    "forbidden_uses_preserved"
  ]
}, null, 2));
