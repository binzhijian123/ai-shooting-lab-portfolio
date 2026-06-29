import { stat } from "node:fs/promises";
import path from "node:path";

export const REQUIRED_ALLOWED_USES = ["local_analysis", "local_acceptance_test"];
export const REQUIRED_FORBIDDEN_USES = ["public_showcase", "external_distribution", "cloud_storage", "model_training"];

export async function validateSampleManifestPolicy(manifest, root) {
  const errors = [];
  const samples = Array.isArray(manifest.samples) ? manifest.samples : [];
  const boundary = manifest.privacy_boundary || {};

  if (manifest.schema_version !== "sample_manifest.v1") {
    errors.push("sample_manifest.schema_version must be sample_manifest.v1");
  }
  if (!samples.length) {
    errors.push("sample_manifest.samples must include at least one sample");
  }
  if (boundary.contains_real_school_team_video !== false) {
    errors.push("sample_manifest.privacy_boundary.contains_real_school_team_video must be false until real video is explicitly authorized");
  }

  const allowedUses = boundary.default_allowed_uses || [];
  for (const use of REQUIRED_ALLOWED_USES) {
    if (!allowedUses.includes(use)) errors.push(`sample_manifest.privacy_boundary.default_allowed_uses must include ${use}`);
  }

  const forbiddenUses = boundary.default_forbidden_uses || [];
  for (const use of REQUIRED_FORBIDDEN_USES) {
    if (!forbiddenUses.includes(use)) errors.push(`sample_manifest.privacy_boundary.default_forbidden_uses must include ${use}`);
  }

  const ids = new Set();
  const sampleSummaries = [];
  for (const sample of samples) {
    const label = sample.id || sample.file_path || "unknown sample";
    const filePath = sample.file_path || "";
    const absolutePath = path.resolve(root, filePath);
    const scope = sample.authorization?.scope || [];
    const fileInfo = await stat(absolutePath).catch(() => null);
    const exists = Boolean(filePath) && Boolean(fileInfo?.isFile());

    if (!sample.id) errors.push("sample_manifest sample missing id");
    if (sample.id && ids.has(sample.id)) errors.push(`sample_manifest duplicate sample id: ${sample.id}`);
    if (sample.id) ids.add(sample.id);
    if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`)) errors.push(`${label} file_path must stay inside repository`);
    if (!exists) errors.push(`sample file missing: ${filePath || "unknown"}`);
    if (exists && fileInfo.size <= 0) errors.push(`${label} file must not be empty`);
    if (!/\.(mp4|mov|m4v|webm)$/i.test(filePath)) errors.push(`${label} file must be a supported browser video`);
    if (sample.authorization?.status !== "authorized") errors.push(`${label} authorization.status must be authorized`);
    for (const use of REQUIRED_ALLOWED_USES) {
      if (!scope.includes(use)) errors.push(`${label} authorization.scope must include ${use}`);
    }
    if (!sample.authorization?.retention) errors.push(`${label} authorization.retention missing`);
    if (!/synthetic|not a real|not real/i.test(sample.authorization?.notes || "")) {
      errors.push(`${label} authorization.notes must state synthetic/non-real boundary`);
    }
    if (boundary.contains_real_school_team_video === false && sample.source_type !== "synthetic") {
      errors.push(`${label} source_type must remain synthetic until real video is explicitly authorized`);
    }
    if (sample.expected_use?.diagnosis_confidence !== "not_for_player_diagnosis") {
      errors.push(`${label} expected_use.diagnosis_confidence must be not_for_player_diagnosis`);
    }
    const limits = sample.expected_use?.known_limits || [];
    if (!limits.some((item) => /not a human|not.*shooting/i.test(item))) {
      errors.push(`${label} known_limits must state it is not a human shooting video`);
    }
    if (!limits.some((item) => /pose diagnosis/i.test(item))) {
      errors.push(`${label} known_limits must state it is not for pose diagnosis`);
    }
    if (!(Number(sample.fps) > 0)) errors.push(`${label} fps must be positive`);
    if (!(Number(sample.duration_ms) > 0)) errors.push(`${label} duration_ms must be positive`);
    if (!(Number(sample.dimensions?.width) > 0 && Number(sample.dimensions?.height) > 0)) {
      errors.push(`${label} dimensions must be positive`);
    }

    sampleSummaries.push({
      id: sample.id,
      file_path: filePath,
      exists,
      source_type: sample.source_type,
      camera_view: sample.camera_view,
      fps: sample.fps || null,
      duration_ms: sample.duration_ms || null,
      dimensions: sample.dimensions || null,
      bytes: fileInfo?.size || 0,
      authorization_status: sample.authorization?.status || "missing",
      authorization_scope: scope,
      diagnosis_confidence: sample.expected_use?.diagnosis_confidence || null
    });
  }

  return {
    summary: {
      schema_version: manifest.schema_version,
      sample_count: samples.length,
      privacy_boundary: {
        contains_real_school_team_video: boundary.contains_real_school_team_video,
        default_allowed_uses: allowedUses,
        default_forbidden_uses: forbiddenUses
      },
      samples: sampleSummaries
    },
    errors
  };
}
