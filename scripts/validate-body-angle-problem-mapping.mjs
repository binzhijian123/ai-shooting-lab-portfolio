import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveKnowledgeCards } from "../server/angleKnowledgeRetrieval.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "distillation", "douyin-shooting-coach", "outputs");
const mapping = JSON.parse(await readFile(path.join(outputDir, "body_angle_problem_mapping.json"), "utf8"));
const knowledgeBase = JSON.parse(await readFile(path.join(outputDir, "knowledge_base.json"), "utf8"));
const errors = [];
const warnings = [];

if (mapping.schema_version !== "body_angle_problem_mapping.v1") {
  errors.push(`schema_version expected body_angle_problem_mapping.v1, got ${mapping.schema_version || "missing"}`);
}
for (const field of [
  "no_universal_ideal_angle",
  "no_single_angle_diagnosis",
  "no_final_total_score",
  "missing_evidence_is_not_negative",
  "paper_values_are_context_priors_not_error_thresholds"
]) {
  if (mapping.policy?.[field] !== true) errors.push(`policy.${field} must be true`);
}

const sourceIds = uniqueIds(mapping.research_sources, "source_id", "research source", errors);
const angleIds = uniqueIds(mapping.angle_definitions, "angle_id", "angle definition", errors);
const observationIds = uniqueIds(mapping.observation_definitions, "observation_id", "observation definition", errors);
const problemIds = uniqueIds(mapping.problem_mappings, "problem_id", "problem mapping", errors);

for (const source of mapping.research_sources || []) {
  if (!source.title || !source.url) errors.push(`${source.source_id}: research source requires title and url`);
  if (!Array.isArray(source.supports) || !source.supports.length) errors.push(`${source.source_id}: supports must be non-empty`);
  if (!source.does_not_support) errors.push(`${source.source_id}: does_not_support is required`);
}

for (const angle of mapping.angle_definitions || []) {
  const label = angle.angle_id || "missing_angle_id";
  for (const field of ["name", "vertex", "interpretation"]) {
    if (!angle[field]) errors.push(`${label}: missing ${field}`);
  }
  for (const field of ["points", "required_view", "required_landmarks"]) {
    if (!Array.isArray(angle[field]) || !angle[field].length) errors.push(`${label}: ${field} must be non-empty`);
  }
}

for (const observation of mapping.observation_definitions || []) {
  const label = observation.observation_id || "missing_observation_id";
  for (const field of ["name", "evidence_family", "evaluation_mode", "direction"]) {
    if (!observation[field]) errors.push(`${label}: missing ${field}`);
  }
  if (!Array.isArray(observation.required_metrics) || !observation.required_metrics.length) {
    errors.push(`${label}: required_metrics must be non-empty`);
  }
  if (observation.standalone_diagnosis_allowed !== false) {
    errors.push(`${label}: standalone_diagnosis_allowed must be false`);
  }
  for (const angleId of observation.angle_ids || []) {
    if (!angleIds.has(angleId)) errors.push(`${label}: unknown angle_id ${angleId}`);
  }
}

const mappingCoverage = [];
for (const problem of mapping.problem_mappings || []) {
  const label = problem.problem_id || "missing_problem_id";
  for (const field of ["name", "body_chain_segment", "inference"]) {
    if (!problem[field]) errors.push(`${label}: missing ${field}`);
  }
  if (!Array.isArray(problem.required_views) || !problem.required_views.length) {
    errors.push(`${label}: required_views must be non-empty`);
  }
  if (!Array.isArray(problem.required_observation_groups) || problem.required_observation_groups.length < 2) {
    errors.push(`${label}: at least two required_observation_groups are required`);
  }
  for (const group of problem.required_observation_groups || []) {
    if (!Array.isArray(group) || !group.length) errors.push(`${label}: every observation group must be non-empty`);
    for (const observationId of group || []) {
      if (!observationIds.has(observationId)) errors.push(`${label}: unknown required observation ${observationId}`);
    }
  }
  for (const observationId of problem.supporting_observations || []) {
    if (!observationIds.has(observationId)) errors.push(`${label}: unknown supporting observation ${observationId}`);
  }
  if (Number(problem.minimum_evidence_families || 0) < 2) {
    errors.push(`${label}: minimum_evidence_families must be at least 2`);
  }
  if (!Array.isArray(problem.false_positive_checks) || problem.false_positive_checks.length < 2) {
    errors.push(`${label}: at least two false_positive_checks are required`);
  }
  const query = problem.knowledge_query || {};
  for (const field of ["tags", "terms", "app_modules"]) {
    if (!Array.isArray(query[field]) || !query[field].length) errors.push(`${label}: knowledge_query.${field} must be non-empty`);
  }
  const knowledgeMatches = retrieveKnowledgeCards(knowledgeBase.cards || [], query);
  if (!knowledgeMatches.length) errors.push(`${label}: knowledge query returned no usable cards`);
  if (knowledgeMatches.length && !knowledgeMatches.some((match) => match.matched_rules.length)) {
    warnings.push(`${label}: cards matched, but no diagnosis rule contains a configured query term`);
  }
  mappingCoverage.push({
    problem_id: problem.problem_id,
    card_matches: knowledgeMatches.length,
    top_card_id: knowledgeMatches[0]?.source_card_id || null,
    top_card_score: knowledgeMatches[0]?.score || 0,
    top_matched_terms: knowledgeMatches[0]?.matched_terms || []
  });
}

const result = {
  ok: errors.length === 0,
  schema_version: "body_angle_problem_mapping_validation.v1",
  mapping_version: mapping.version || null,
  research_sources: sourceIds.size,
  angle_definitions: angleIds.size,
  observation_definitions: observationIds.size,
  problem_mappings: problemIds.size,
  knowledge_cards: knowledgeBase.cards?.length || 0,
  mapping_coverage: mappingCoverage,
  warnings,
  errors
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);

function uniqueIds(items, field, label, outputErrors) {
  const ids = new Set();
  if (!Array.isArray(items) || !items.length) {
    outputErrors.push(`${label} list must be non-empty`);
    return ids;
  }
  for (const item of items) {
    const id = item?.[field];
    if (!id) {
      outputErrors.push(`${label}: missing ${field}`);
      continue;
    }
    if (ids.has(id)) outputErrors.push(`${label}: duplicate ${id}`);
    ids.add(id);
  }
  return ids;
}
