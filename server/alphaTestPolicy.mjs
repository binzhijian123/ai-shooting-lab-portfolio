export const ALPHA_FORBIDDEN_USES = [
  "public_showcase",
  "external_distribution",
  "cloud_storage",
  "model_training",
  "player_diagnosis_claim"
];

export function validateAlphaTestRequest(body, upload) {
  const authorization = body?.authorization || {};
  const errors = [];
  if (!upload) {
    errors.push({
      code: "upload_not_found",
      message: "authorized alpha analysis requires an existing local upload_id"
    });
  }
  if (!nonEmptyString(body?.tester_agreement_id || authorization.tester_agreement_id)) {
    errors.push({
      code: "missing_tester_agreement_id",
      message: "tester_agreement_id is required for local alpha analysis"
    });
  }
  if (authorization.local_analysis !== true) {
    errors.push({
      code: "local_analysis_not_authorized",
      message: "authorization.local_analysis must be true"
    });
  }
  if (authorization.local_acceptance_test !== true) {
    errors.push({
      code: "local_acceptance_test_not_authorized",
      message: "authorization.local_acceptance_test must be true"
    });
  }
  for (const key of ["allow_public_showcase", "allow_external_distribution", "allow_cloud_storage", "allow_model_training"]) {
    if (authorization[key] !== false) {
      errors.push({
        code: `${key}_must_be_false`,
        message: `authorization.${key} must be false`
      });
    }
  }
  return {
    ok: errors.length === 0,
    schema_version: "authorized_alpha_test_policy.v1",
    source_contract: "local_authorized_alpha_test_not_diagnosis",
    tester_agreement_id: body?.tester_agreement_id || authorization.tester_agreement_id || null,
    status: errors.length ? "rejected" : "accepted_for_local_review_only",
    required_authorization: [
      "tester_agreement_id",
      "authorization.local_analysis=true",
      "authorization.local_acceptance_test=true",
      "authorization.allow_public_showcase=false",
      "authorization.allow_external_distribution=false",
      "authorization.allow_cloud_storage=false",
      "authorization.allow_model_training=false"
    ],
    forbidden_uses: ALPHA_FORBIDDEN_USES,
    errors
  };
}

export function applyAlphaTestBoundary(evidence, policy) {
  const packet = structuredClone(evidence);
  packet.task = "authorized_alpha_test_review_only";
  packet.alpha_test = {
    schema_version: "authorized_alpha_test.v1",
    source_contract: "local_authorized_alpha_test_not_diagnosis",
    status: "review_only",
    tester_agreement_id: policy.tester_agreement_id,
    storage: "local_uploads_only",
    diagnosis_allowed: false,
    forbidden_uses: ALPHA_FORBIDDEN_USES
  };
  packet.video_context = {
    ...packet.video_context,
    source_type: "authorized_alpha_test_local_upload",
    authorization_status: "local_alpha_authorized",
    diagnosis_confidence: "review_only_not_for_player_diagnosis"
  };
  packet.pipeline_status = {
    ...packet.pipeline_status,
    alpha_test_layer: "authorized_local_review_only",
    diagnosis_policy: "alpha_test_results_are_review_only_not_player_diagnosis"
  };
  packet.confidence = {
    ...packet.confidence,
    overall: Math.min(Number(packet.confidence?.overall || 0), 0.49),
    max_report_confidence: "low",
    degradation_reasons: [
      ...new Set([
        ...(packet.confidence?.degradation_reasons || []),
        "authorized_alpha_test_review_only",
        "not_validated_for_real_player_diagnosis"
      ])
    ]
  };
  packet.missing_evidence = [
    ...(packet.missing_evidence || []),
    {
      type: "alpha_test_boundary",
      value: "not_validated_for_real_player_diagnosis",
      impact: "授权 Alpha 测试只验证本地流程和报告可读性，不证明真实球员诊断质量。"
    }
  ];
  return packet;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
