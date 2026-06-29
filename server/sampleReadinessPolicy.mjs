export const AUTHORIZED_SAMPLE_SOURCE_TYPES = [
  "representative_authorized",
  "real_school_team_authorized"
];

export const REQUIRED_READINESS_SCOPES = [
  "local_analysis",
  "local_acceptance_test"
];

export const FORBIDDEN_REAL_SAMPLE_SCOPES = [
  "public_showcase",
  "external_distribution",
  "cloud_storage",
  "model_training"
];

export function auditAuthorizedSampleReadiness(manifest) {
  const samples = Array.isArray(manifest?.samples) ? manifest.samples : [];
  const errors = [];
  const readySamples = [];
  const candidateSamples = [];

  for (const sample of samples) {
    if (!AUTHORIZED_SAMPLE_SOURCE_TYPES.includes(sample?.source_type)) continue;
    const sampleErrors = validateReadinessSample(sample);
    candidateSamples.push({
      id: sample.id || null,
      source_type: sample.source_type || null,
      camera_view: sample.camera_view || null,
      authorization_status: sample.authorization?.status || "missing",
      error_count: sampleErrors.length
    });
    errors.push(...sampleErrors);
    if (!sampleErrors.length) {
      readySamples.push({
        id: sample.id,
        source_type: sample.source_type,
        camera_view: sample.camera_view,
        scope: sample.authorization.scope,
        retention: sample.authorization.retention,
        diagnosis_confidence: sample.expected_use?.diagnosis_confidence || null
      });
    }
  }

  return {
    schema_version: "authorized_sample_readiness_audit.v1",
    source_contract: "metadata_only_no_video_file_access",
    status: readySamples.length ? "ready_for_local_authorized_sample_validation" : "waiting_for_authorized_samples",
    candidate_sample_count: candidateSamples.length,
    ready_sample_count: readySamples.length,
    candidate_samples: candidateSamples,
    ready_samples: readySamples,
    required_scope: REQUIRED_READINESS_SCOPES,
    forbidden_scope: FORBIDDEN_REAL_SAMPLE_SCOPES,
    required_metadata: [
      "authorization.provider",
      "authorization.subject_authorization.status=documented",
      "authorization.retention.storage=local_only",
      "authorization.retention.delete_raw_video_after_days",
      "authorization.retention.review_by",
      "privacy.allow_public_showcase=false",
      "privacy.allow_external_distribution=false",
      "privacy.allow_cloud_storage=false",
      "privacy.allow_model_training=false",
      "expected_use.diagnosis_confidence=representative_validation_only|requires_human_review"
    ],
    errors
  };
}

function validateReadinessSample(sample) {
  const errors = [];
  const id = sample.id || "unknown_sample";
  const auth = sample.authorization || {};
  const scope = Array.isArray(auth.scope) ? auth.scope : [];
  const retention = auth.retention || {};
  const privacy = sample.privacy || {};
  const expectedUse = sample.expected_use || {};

  if (!sample.id) push(errors, id, "missing_id", "sample.id is required");
  if (auth.status !== "authorized") push(errors, id, "authorization_status_not_authorized", "authorization.status must be authorized");
  if (!nonEmptyString(auth.provider)) push(errors, id, "missing_authorization_provider", "authorization.provider is required");
  for (const requiredScope of REQUIRED_READINESS_SCOPES) {
    if (!scope.includes(requiredScope)) {
      push(errors, id, `missing_scope_${requiredScope}`, `authorization.scope must include ${requiredScope}`);
    }
  }
  for (const forbiddenScope of FORBIDDEN_REAL_SAMPLE_SCOPES) {
    if (scope.includes(forbiddenScope)) {
      push(errors, id, `forbidden_scope_${forbiddenScope}`, `authorization.scope must not include ${forbiddenScope}`);
    }
  }

  if (auth.subject_authorization?.status !== "documented") {
    push(errors, id, "subject_authorization_not_documented", "authorization.subject_authorization.status must be documented");
  }
  if (!nonEmptyString(auth.subject_authorization?.authority)) {
    push(errors, id, "missing_subject_authorization_authority", "authorization.subject_authorization.authority is required");
  }
  if (!isIsoDate(auth.subject_authorization?.recorded_at)) {
    push(errors, id, "missing_subject_authorization_recorded_at", "authorization.subject_authorization.recorded_at must be YYYY-MM-DD");
  }

  if (retention.storage !== "local_only") {
    push(errors, id, "retention_storage_not_local_only", "authorization.retention.storage must be local_only");
  }
  if (!(Number.isInteger(Number(retention.delete_raw_video_after_days)) && Number(retention.delete_raw_video_after_days) > 0)) {
    push(errors, id, "missing_delete_raw_video_after_days", "authorization.retention.delete_raw_video_after_days must be a positive integer");
  }
  if (!isIsoDate(retention.review_by)) {
    push(errors, id, "missing_retention_review_by", "authorization.retention.review_by must be YYYY-MM-DD");
  }

  for (const [key, code] of [
    ["allow_public_showcase", "privacy_allows_public_showcase"],
    ["allow_external_distribution", "privacy_allows_external_distribution"],
    ["allow_cloud_storage", "privacy_allows_cloud_storage"],
    ["allow_model_training", "privacy_allows_model_training"]
  ]) {
    if (privacy[key] !== false) {
      push(errors, id, code, `privacy.${key} must be false`);
    }
  }

  if (!["representative_validation_only", "requires_human_review"].includes(expectedUse.diagnosis_confidence)) {
    push(errors, id, "diagnosis_confidence_not_readiness_safe", "expected_use.diagnosis_confidence must remain readiness-safe");
  }
  const limits = Array.isArray(expectedUse.known_limits) ? expectedUse.known_limits.join(" ") : "";
  if (!/not.*public|no.*public/i.test(limits)) {
    push(errors, id, "missing_public_use_limit", "expected_use.known_limits must state no public use");
  }
  if (!/not.*stable|human review|representative/i.test(limits)) {
    push(errors, id, "missing_diagnosis_quality_limit", "expected_use.known_limits must state representative or human-review limits");
  }
  if (!nonEmptyString(sample.file_path)) push(errors, id, "missing_file_path", "sample.file_path is required");
  if (!nonEmptyString(sample.camera_view)) push(errors, id, "missing_camera_view", "sample.camera_view is required");

  return errors;
}

function push(errors, sampleId, code, message) {
  errors.push({ sample_id: sampleId, code, message });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
