const ACTIVE_OBSERVATION_STATUSES = new Set(["candidate", "supported", "confirmed"]);

export function summarizeBodyAngleProblemMapping(mapping = {}) {
  return {
    schema_version: mapping.schema_version || "body_angle_problem_mapping.v1",
    version: mapping.version || null,
    source_contract: mapping.source_contract || null,
    policy: mapping.policy || null,
    baseline_contract: mapping.baseline_contract || null,
    angle_count: mapping.angle_definitions?.length || 0,
    observation_count: mapping.observation_definitions?.length || 0,
    problem_mapping_count: mapping.problem_mappings?.length || 0,
    research_source_count: mapping.research_sources?.length || 0,
    problems: (mapping.problem_mappings || []).map((problem) => ({
      problem_id: problem.problem_id,
      name: problem.name,
      body_chain_segment: problem.body_chain_segment,
      required_views: problem.required_views || [],
      minimum_evidence_families: problem.minimum_evidence_families,
      knowledge_query: problem.knowledge_query
    }))
  };
}

export function buildAngleKnowledgeRetrieval({
  mapping = {},
  knowledgeBase = {},
  observations = [],
  context = {}
} = {}) {
  const observationDefinitions = new Map(
    (mapping.observation_definitions || []).map((definition) => [definition.observation_id, definition])
  );
  const observationById = new Map(
    observations
      .filter((observation) => observation?.observation_id)
      .map((observation) => [observation.observation_id, normalizeObservation(observation, observationDefinitions)])
  );
  const presentViews = new Set(normalizeStringArray(context.camera_views || context.camera_view));
  const contextRepeatabilityRatio = finiteNumber(context.repeatability_ratio);
  const matches = [];

  for (const problem of mapping.problem_mappings || []) {
    const relevantObservationIds = new Set([
      ...(problem.required_observation_groups || []).flat(),
      ...(problem.supporting_observations || [])
    ]);
    const relevantObservations = [...relevantObservationIds]
      .map((observationId) => observationById.get(observationId))
      .filter(Boolean);
    if (!relevantObservations.length) continue;

    const activeObservationIds = new Set(
      relevantObservations
        .filter((observation) => ACTIVE_OBSERVATION_STATUSES.has(observation.status))
        .map((observation) => observation.observation_id)
    );
    const groupEvidence = (problem.required_observation_groups || []).map((group) => ({
      any_of: group,
      supporting_observation_ids: group.filter((observationId) => activeObservationIds.has(observationId)),
      satisfied: group.some((observationId) => activeObservationIds.has(observationId))
    }));
    const missingViews = (problem.required_views || []).filter((view) => !presentViews.has(view));
    const activeObservations = relevantObservations.filter((observation) =>
      activeObservationIds.has(observation.observation_id)
    );
    const evidenceFamilies = [...new Set(
      activeObservations.map((observation) => observation.evidence_family).filter(Boolean)
    )];
    const groupsSatisfied = groupEvidence.length > 0 && groupEvidence.every((group) => group.satisfied);
    const familiesSatisfied = evidenceFamilies.length >= Number(
      problem.minimum_evidence_families || mapping.policy?.minimum_evidence_families_for_candidate || 2
    );
    const viewSatisfied = missingViews.length === 0;
    const repeatabilityRatio = contextRepeatabilityRatio;
    const candidate = groupsSatisfied && familiesSatisfied && viewSatisfied;
    const supported = candidate
      && repeatabilityRatio !== null
      && repeatabilityRatio >= Number(problem.supported_repeatability_ratio || 0.6);
    const status = !viewSatisfied
      ? "not_judgable"
      : supported
        ? "supported_pattern"
        : candidate
          ? "candidate"
          : "observed";

    const knowledgeMatches = status === "not_judgable"
      ? []
      : retrieveKnowledgeCards(knowledgeBase.cards || [], problem.knowledge_query || {});

    matches.push({
      problem_id: problem.problem_id,
      name: problem.name,
      body_chain_segment: problem.body_chain_segment,
      status,
      diagnosis_allowed: status === "supported_pattern" && Boolean(context.human_reviewed),
      candidate_allowed: candidate,
      inference: problem.inference,
      required_views: problem.required_views || [],
      missing_views: missingViews,
      group_evidence: groupEvidence,
      evidence_families: evidenceFamilies,
      minimum_evidence_families: problem.minimum_evidence_families,
      active_observations: activeObservations,
      repeatability_ratio: contextRepeatabilityRatio,
      false_positive_checks: problem.false_positive_checks || [],
      knowledge_query: problem.knowledge_query,
      knowledge_matches: knowledgeMatches
    });
  }

  return {
    schema_version: "angle_knowledge_retrieval.v1",
    mapping_version: mapping.version || null,
    policy: {
      output_is_candidate_only_without_human_review: true,
      single_angle_diagnosis_allowed: false,
      missing_evidence_is_not_negative: true
    },
    context: {
      camera_views: [...presentViews],
      shot_type: context.shot_type || null,
      distance_band: context.distance_band || null,
      valid_attempt_count: finiteNumber(context.valid_attempt_count),
      repeatability_ratio: contextRepeatabilityRatio,
      human_reviewed: Boolean(context.human_reviewed)
    },
    observation_count: observations.length,
    matches: matches.sort(compareProblemMatches)
  };
}

export function retrieveKnowledgeCards(cards = [], query = {}) {
  const tags = new Set(normalizeStringArray(query.tags));
  const appModules = new Set(normalizeStringArray(query.app_modules));
  const terms = normalizeStringArray(query.terms);
  const minimumTermMatches = Number(query.minimum_term_matches ?? 1);
  const topK = Math.max(1, Number(query.top_k || 5));

  return cards
    .filter(isUsableKnowledgeCard)
    .map((card) => scoreKnowledgeCard(card, { tags, appModules, terms }))
    .filter((match) => match.matched_terms.length >= minimumTermMatches)
    .sort((a, b) => b.score - a.score || a.source_card_id.localeCompare(b.source_card_id))
    .slice(0, topK);
}

function normalizeObservation(observation, observationDefinitions) {
  const definition = observationDefinitions.get(observation.observation_id) || {};
  return {
    observation_id: observation.observation_id,
    name: observation.name || definition.name || observation.observation_id,
    status: observation.status || "observed",
    confidence: finiteNumber(observation.confidence),
    evidence_family: observation.evidence_family || definition.evidence_family || null,
    metric_ids: normalizeStringArray(observation.metric_ids || definition.required_metrics),
    value: observation.value ?? null,
    baseline_source: observation.baseline_source || null,
    source_view: observation.source_view || null
  };
}

function scoreKnowledgeCard(card, { tags, appModules, terms }) {
  const cardTags = new Set(normalizeStringArray([...(card.tags || []), ...(card.motion_focus || [])]));
  const cardModules = new Set(normalizeStringArray(card.app_modules));
  const text = normalizeText([
    card.title,
    card.summary,
    ...(card.observable_signals || []),
    ...(card.core_rules || []),
    ...(card.false_positives || []),
    ...(card.diagnosis_rules || []).flatMap((rule) => [rule.if, rule.then, rule.check, rule.repair]),
    ...(card.repair_actions || []).flatMap((action) => [action.drill, action.cue, action.success_metric])
  ].filter(Boolean).join(" "));
  const matchedTags = [...tags].filter((tag) => cardTags.has(tag));
  const matchedModules = [...appModules].filter((module) => cardModules.has(module));
  const matchedTerms = terms.filter((term) => text.includes(normalizeText(term)));
  const score = matchedTags.length * 3 + matchedModules.length + matchedTerms.length * 4;
  const matchedRules = (card.diagnosis_rules || [])
    .filter(isUsableDiagnosisRule)
    .map((rule) => {
      const ruleText = normalizeText(`${rule.if || ""} ${rule.then || ""} ${rule.check || ""} ${rule.repair || ""}`);
      const ruleTerms = terms.filter((term) => ruleText.includes(normalizeText(term)));
      return { ...rule, matched_terms: ruleTerms };
    })
    .filter((rule) => rule.matched_terms.length)
    .sort((a, b) => b.matched_terms.length - a.matched_terms.length)
    .slice(0, 3);

  return {
    source_card_id: card.id,
    title: card.title,
    source_url: card.source_url || null,
    score,
    matched_tags: matchedTags,
    matched_modules: matchedModules,
    matched_terms: matchedTerms,
    matched_rules: matchedRules,
    repair_actions: (card.repair_actions || [])
      .filter((action) => action?.drill && action.drill !== "not_stated")
      .slice(0, 3),
    false_positives: (card.false_positives || []).slice(0, 3)
  };
}

function isUsableKnowledgeCard(card) {
  if (!card || !card.id || !Array.isArray(card.diagnosis_rules)) return false;
  const observable = card.observable_signals || [];
  if (observable.length && observable.every((item) => item === "not_stated")) return false;
  return card.diagnosis_rules.some(isUsableDiagnosisRule);
}

function isUsableDiagnosisRule(rule) {
  if (!rule || typeof rule !== "object") return false;
  const text = `${rule.if || ""} ${rule.then || ""} ${rule.repair || ""}`;
  return Boolean(text) && !/无法提取|不包含投篮技术|not_stated/i.test(text);
}

function compareProblemMatches(a, b) {
  const priority = { supported_pattern: 0, candidate: 1, observed: 2, not_judgable: 3 };
  return (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
    || b.knowledge_matches.length - a.knowledge_matches.length
    || a.problem_id.localeCompare(b.problem_id);
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
