export function summarizeScoringRegistry(scoringRegistry = {}) {
  scoringRegistry ||= {};
  const dimensions = Array.isArray(scoringRegistry.dimensions) ? scoringRegistry.dimensions : [];
  return {
    schema_version: scoringRegistry.schema_version || "scoring_registry.v1",
    version: scoringRegistry.version || null,
    source_contract: scoringRegistry.source_contract || null,
    policy: scoringRegistry.policy || null,
    dimension_count: dimensions.length,
    current_or_partial_dimension_count: dimensions.filter((dimension) =>
      ["current", "partial"].includes(dimension.automation_status)
    ).length,
    manual_or_planned_dimension_count: dimensions.filter((dimension) =>
      ["manual_first", "planned"].includes(dimension.automation_status)
    ).length,
    dimensions: dimensions.map((dimension) => ({
      dimension_id: dimension.dimension_id,
      name: dimension.name,
      automation_status: dimension.automation_status,
      linked_signal_ids: dimension.linked_signal_ids || [],
      planned_signal_ids: dimension.planned_signal_ids || [],
      tutorial_routes: (dimension.tutorial_routes || []).map((route) => ({
        tutorial_id: route.tutorial_id,
        title: route.title,
        repair_target_id: route.repair_target_id
      }))
    }))
  };
}

export function summarizeCreatorAngleMapping(creatorAngleMapping = {}) {
  creatorAngleMapping ||= {};
  const mappings = Array.isArray(creatorAngleMapping.mappings) ? creatorAngleMapping.mappings : [];
  return {
    schema_version: creatorAngleMapping.schema_version || "creator_angle_mapping.v1",
    version: creatorAngleMapping.version || null,
    source_contract: creatorAngleMapping.source_contract || null,
    policy: creatorAngleMapping.policy || null,
    mapping_count: mappings.length,
    active_mapping_count: mappings.filter((mapping) => mapping.mapping_status === "active").length,
    review_only_mapping_count: mappings.filter((mapping) => mapping.mapping_status === "review_only").length,
    deferred_mapping_count: mappings.filter((mapping) => mapping.mapping_status === "deferred").length,
    mappings: mappings.map((mapping) => ({
      creator_angle_id: mapping.creator_angle_id,
      creator_language: mapping.creator_language,
      mapping_type: mapping.mapping_type,
      mapping_status: mapping.mapping_status,
      primary_dimension_id: mapping.primary_dimension_id,
      maps_to_dimension_ids: mapping.maps_to_dimension_ids || [],
      maps_to_problem: mapping.maps_to_problem
    }))
  };
}

export function buildMatchedScoringDimensions({
  scoringRegistry = {},
  creatorAngleMapping = {},
  matchedSignals = [],
  matchedRules = [],
  missingEvidence = [],
  confidence = {}
} = {}) {
  scoringRegistry ||= {};
  creatorAngleMapping ||= {};
  const dimensions = Array.isArray(scoringRegistry.dimensions) ? scoringRegistry.dimensions : [];
  const creatorMappings = Array.isArray(creatorAngleMapping.mappings) ? creatorAngleMapping.mappings : [];
  const signalById = new Map(matchedSignals.map((signal) => [signal.signal_id, signal]));
  const candidateSignalIds = new Set(
    matchedSignals
      .filter((signal) => signal.status === "candidate")
      .map((signal) => signal.signal_id)
  );
  const missingViewValues = new Set(
    missingEvidence
      .filter((item) => item.type === "view")
      .map((item) => item.value)
  );

  return dimensions.map((dimension) => {
    const linkedSignalIds = dimension.linked_signal_ids || [];
    const observedSignalIds = linkedSignalIds.filter((signalId) => signalById.has(signalId));
    const supportingSignalIds = linkedSignalIds.filter((signalId) => candidateSignalIds.has(signalId));
    const linkedRules = matchedRules.filter((rule) =>
      (rule.linked_signal_ids || []).some((signalId) => linkedSignalIds.includes(signalId))
        || (rule.supporting_signal_ids || []).some((signalId) => linkedSignalIds.includes(signalId))
    );
    const missingRequiredViews = (dimension.required_views || []).filter((view) => missingViewValues.has(view));
    const status = scoringDimensionStatus({
      dimension,
      observedSignalIds,
      supportingSignalIds,
      linkedRules,
      missingRequiredViews
    });

    return {
      dimension_id: dimension.dimension_id,
      name: dimension.name,
      automation_status: dimension.automation_status,
      status,
      professional_definition: dimension.professional_definition,
      user_explanation: dimension.user_explanation,
      evaluation_goal: dimension.evaluation_goal,
      required_views: dimension.required_views || [],
      required_metrics: dimension.required_metrics || [],
      linked_signal_ids: linkedSignalIds,
      observed_signal_ids: observedSignalIds,
      supporting_signal_ids: supportingSignalIds,
      linked_rule_ids: linkedRules.map((rule) => rule.rule_id).filter(Boolean),
      missing_required_views: missingRequiredViews,
      confidence_cap: confidence.max_report_confidence || "low",
      decision_policy: dimension.decision_policy,
      knowledge_links: dimension.knowledge_links,
      body_chain: dimension.body_chain || [],
      false_positive_checks: dimension.false_positive_checks || [],
      tutorial_routes: dimension.tutorial_routes || [],
      creator_angle_matches: buildCreatorAngleMatches({
        dimension,
        creatorMappings,
        candidateSignalIds,
        signalById
      }),
      evidence_note: scoringEvidenceNote(status, supportingSignalIds, missingRequiredViews, dimension)
    };
  });
}

function buildCreatorAngleMatches({ dimension, creatorMappings, candidateSignalIds, signalById }) {
  return creatorMappings
    .filter((mapping) => (mapping.maps_to_dimension_ids || []).includes(dimension.dimension_id))
    .map((mapping) => {
      const requiredSignalIds = mapping.required_signal_ids || [];
      const observedRequiredSignalIds = requiredSignalIds.filter((signalId) => signalById.has(signalId));
      const supportingRequiredSignalIds = requiredSignalIds.filter((signalId) => candidateSignalIds.has(signalId));
      return {
        creator_angle_id: mapping.creator_angle_id,
        creator_language: mapping.creator_language,
        aliases: mapping.aliases || [],
        mapping_type: mapping.mapping_type,
        mapping_status: mapping.mapping_status,
        maps_to_problem: mapping.maps_to_problem,
        why_this_mapping_is_valid: mapping.why_this_mapping_is_valid,
        inference_path: mapping.inference_path || [],
        required_signal_ids: requiredSignalIds,
        observed_required_signal_ids: observedRequiredSignalIds,
        supporting_required_signal_ids: supportingRequiredSignalIds,
        confidence_policy: mapping.confidence_policy,
        repair_target_ids: mapping.repair_target_ids || [],
        tutorial_ids: mapping.tutorial_ids || [],
        false_positive_checks: mapping.false_positive_checks || []
      };
    });
}

function scoringDimensionStatus({ dimension, observedSignalIds, supportingSignalIds, linkedRules, missingRequiredViews }) {
  if (["manual_first", "planned"].includes(dimension.automation_status)) return "not_supported";
  if (missingRequiredViews.length) return "insufficient_evidence";
  if (supportingSignalIds.length && linkedRules.length) return "evidence_candidate";
  if (supportingSignalIds.length || observedSignalIds.length) return "review";
  return "insufficient_evidence";
}

function scoringEvidenceNote(status, supportingSignalIds, missingRequiredViews, dimension) {
  if (status === "evidence_candidate") {
    return `该维度有 ${supportingSignalIds.length} 个候选 signal 支持，可进入知识库解释和教程路由。`;
  }
  if (status === "review") {
    return "该维度已有部分证据，但还不足以作为稳定诊断；需要结合人工复核或补充视角。";
  }
  if (status === "insufficient_evidence") {
    const viewText = missingRequiredViews.length ? `缺少 ${missingRequiredViews.join(", ")} 视角。` : "";
    return `${viewText}证据不足时不扣技术分，只记录缺口。`;
  }
  return `${dimension.name} 当前为 ${dimension.automation_status}，只作为知识解释或后续模型扩展，不自动评分。`;
}
