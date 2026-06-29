import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const kbPath = path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json");
const registryPath = path.join(root, "distillation", "douyin-shooting-coach", "outputs", "scoring_registry.json");
const creatorAngleMappingPath = path.join(root, "distillation", "douyin-shooting-coach", "outputs", "creator_angle_mapping.json");

const kb = JSON.parse(await readFile(kbPath, "utf8"));
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const creatorAngleMapping = JSON.parse(await readFile(creatorAngleMappingPath, "utf8"));
const errors = [];
const warnings = [];

const signals = new Set((kb.signal_registry?.signals || []).map((signal) => signal.signal_id));
const knowledgeTags = new Set(kb.taxonomy?.source_specific_tags || []);
const dimensionIds = new Set();
const tutorialIds = new Set();
const repairTargetIds = new Set();
const plannedSignalIds = new Set();

if (registry.schema_version !== "scoring_registry.v1") {
  errors.push(`schema_version expected scoring_registry.v1, got ${registry.schema_version || "missing"}`);
}
if (registry.policy?.no_final_total_score !== true) {
  errors.push("policy.no_final_total_score must be true");
}
if (registry.policy?.no_practice_game_score_in_v1 !== true) {
  errors.push("policy.no_practice_game_score_in_v1 must be true");
}
if (!Array.isArray(registry.dimensions) || !registry.dimensions.length) {
  errors.push("dimensions must be a non-empty array");
}

for (const dimension of registry.dimensions || []) {
  const label = dimension.dimension_id || "missing_dimension_id";
  if (!dimension.dimension_id || !/^[a-z][a-z0-9_]*$/.test(dimension.dimension_id)) {
    errors.push(`${label}: invalid dimension_id`);
  }
  if (dimensionIds.has(dimension.dimension_id)) {
    errors.push(`${label}: duplicate dimension_id`);
  }
  dimensionIds.add(dimension.dimension_id);

  for (const field of [
    "name",
    "automation_status",
    "professional_definition",
    "user_explanation",
    "evaluation_goal"
  ]) {
    if (!dimension[field]) errors.push(`${label}: missing ${field}`);
  }

  for (const field of ["required_views", "required_metrics", "body_chain", "observable_evidence", "false_positive_checks", "tutorial_routes"]) {
    if (!Array.isArray(dimension[field]) || !dimension[field].length) {
      errors.push(`${label}: ${field} must be a non-empty array`);
    }
  }

  const linkedSignals = dimension.linked_signal_ids || [];
  const plannedSignals = dimension.planned_signal_ids || [];
  if (!Array.isArray(linkedSignals)) errors.push(`${label}: linked_signal_ids must be an array`);
  if (!Array.isArray(plannedSignals)) errors.push(`${label}: planned_signal_ids must be an array`);

  for (const signalId of linkedSignals) {
    if (!signals.has(signalId)) errors.push(`${label}: linked signal does not exist in knowledge_base signal_registry: ${signalId}`);
  }
  for (const signalId of plannedSignals) plannedSignalIds.add(signalId);

  if ((dimension.automation_status === "current" || dimension.automation_status === "partial") && !linkedSignals.length) {
    errors.push(`${label}: ${dimension.automation_status} dimensions must link at least one existing signal`);
  }
  if ((dimension.automation_status === "manual_first" || dimension.automation_status === "planned") && !plannedSignals.length) {
    errors.push(`${label}: ${dimension.automation_status} dimensions must declare planned_signal_ids`);
  }

  const links = dimension.knowledge_links || {};
  for (const field of ["linked_knowledge_tags", "concept_ids", "repair_target_ids"]) {
    if (!Array.isArray(links[field]) || !links[field].length) {
      errors.push(`${label}: knowledge_links.${field} must be a non-empty array`);
    }
  }
  for (const repairTargetId of links.repair_target_ids || []) repairTargetIds.add(repairTargetId);
  for (const tag of links.linked_knowledge_tags || []) {
    if (!knowledgeTags.has(tag)) warnings.push(`${label}: knowledge tag not present in current taxonomy: ${tag}`);
  }

  for (const field of ["candidate_when", "review_when", "insufficient_when"]) {
    if (!dimension.decision_policy?.[field]) errors.push(`${label}: missing decision_policy.${field}`);
  }

  for (const route of dimension.tutorial_routes || []) {
    if (!route.tutorial_id || !route.title || !route.repair_target_id) {
      errors.push(`${label}: tutorial route requires tutorial_id, title, repair_target_id`);
      continue;
    }
    tutorialIds.add(route.tutorial_id);
    if (!(links.repair_target_ids || []).includes(route.repair_target_id)) {
      errors.push(`${label}: tutorial ${route.tutorial_id} repair_target_id is not declared in knowledge_links`);
    }
  }
}

validateCreatorAngleMapping({
  creatorAngleMapping,
  dimensionIds,
  signals,
  plannedSignalIds,
  repairTargetIds,
  tutorialIds,
  errors,
  warnings
});

const forbiddenDimensionIds = new Set(["practice_game_score", "final_total_score"]);
for (const dimension of registry.dimensions || []) {
  if (forbiddenDimensionIds.has(dimension.dimension_id)) {
    errors.push(`forbidden scoring dimension appears in registry: ${dimension.dimension_id}`);
  }
}
for (const key of collectKeys(registry)) {
  if (["score_weight", "dimension_weight", "final_score_formula"].includes(key)) {
    errors.push(`forbidden scoring formula field appears in registry: ${key}`);
  }
}

const currentOrPartial = (registry.dimensions || []).filter((dimension) => ["current", "partial"].includes(dimension.automation_status));
if (!currentOrPartial.length) errors.push("at least one dimension must be current or partial");
if (!tutorialIds.size) errors.push("at least one tutorial route is required");

const result = {
  ok: errors.length === 0,
  schema_version: "scoring_registry_validation.v1",
  registry_version: registry.version || null,
  creator_angle_mapping_version: creatorAngleMapping.version || null,
  dimensions: registry.dimensions?.length || 0,
  creator_angle_mappings: creatorAngleMapping.mappings?.length || 0,
  current_or_partial_dimensions: currentOrPartial.length,
  linked_signal_count: [...new Set((registry.dimensions || []).flatMap((dimension) => dimension.linked_signal_ids || []))].length,
  tutorial_route_count: tutorialIds.size,
  warnings,
  errors
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nested, keys);
  }
  return keys;
}

function validateCreatorAngleMapping({
  creatorAngleMapping,
  dimensionIds,
  signals,
  plannedSignalIds,
  repairTargetIds,
  tutorialIds,
  errors,
  warnings
}) {
  if (creatorAngleMapping.schema_version !== "creator_angle_mapping.v1") {
    errors.push(`creator_angle_mapping.schema_version expected creator_angle_mapping.v1, got ${creatorAngleMapping.schema_version || "missing"}`);
  }
  if (creatorAngleMapping.policy?.no_final_total_score !== true) {
    errors.push("creator_angle_mapping.policy.no_final_total_score must be true");
  }
  if (creatorAngleMapping.policy?.no_practice_game_score_in_v1 !== true) {
    errors.push("creator_angle_mapping.policy.no_practice_game_score_in_v1 must be true");
  }
  const mappings = creatorAngleMapping.mappings || [];
  if (!Array.isArray(mappings) || !mappings.length) {
    errors.push("creator_angle_mapping.mappings must be a non-empty array");
    return;
  }

  const angleIds = new Set();
  for (const mapping of mappings) {
    const label = mapping.creator_angle_id || "missing_creator_angle_id";
    if (!mapping.creator_angle_id || !/^angle\.[a-z][a-z0-9_]*$/.test(mapping.creator_angle_id)) {
      errors.push(`${label}: invalid creator_angle_id`);
    }
    if (angleIds.has(mapping.creator_angle_id)) errors.push(`${label}: duplicate creator_angle_id`);
    angleIds.add(mapping.creator_angle_id);

    for (const field of [
      "creator_language",
      "mapping_type",
      "mapping_status",
      "maps_to_problem",
      "why_this_mapping_is_valid",
      "confidence_policy"
    ]) {
      if (!mapping[field]) errors.push(`${label}: missing ${field}`);
    }
    if (!Array.isArray(mapping.aliases) || !mapping.aliases.length) errors.push(`${label}: aliases must be a non-empty array`);
    if (!Array.isArray(mapping.inference_path) || !mapping.inference_path.length) errors.push(`${label}: inference_path must be a non-empty array`);
    if (!Array.isArray(mapping.false_positive_checks) || !mapping.false_positive_checks.length) errors.push(`${label}: false_positive_checks must be a non-empty array`);

    const deferred = mapping.mapping_status === "deferred" || mapping.mapping_type === "excluded_v1";
    const mappedDimensions = mapping.maps_to_dimension_ids || [];
    if (!deferred && !mappedDimensions.length) errors.push(`${label}: active/review mappings must map to at least one dimension`);
    if (mapping.primary_dimension_id && !dimensionIds.has(mapping.primary_dimension_id)) {
      errors.push(`${label}: primary_dimension_id does not exist in scoring registry: ${mapping.primary_dimension_id}`);
    }
    if (!mapping.primary_dimension_id && !deferred) {
      errors.push(`${label}: non-deferred mapping must declare primary_dimension_id`);
    }
    for (const dimensionId of mappedDimensions) {
      if (!dimensionIds.has(dimensionId)) errors.push(`${label}: mapped dimension does not exist in scoring registry: ${dimensionId}`);
    }

    for (const signalId of mapping.required_signal_ids || []) {
      if (!signals.has(signalId)) errors.push(`${label}: required signal does not exist in knowledge_base signal_registry: ${signalId}`);
    }
    for (const signalId of mapping.supporting_signal_ids || []) {
      if (!signals.has(signalId)) errors.push(`${label}: supporting signal does not exist in knowledge_base signal_registry: ${signalId}`);
    }
    for (const signalId of mapping.planned_signal_ids || []) {
      if (!plannedSignalIds.has(signalId)) warnings.push(`${label}: planned signal is not declared by any scoring dimension: ${signalId}`);
    }

    for (const repairTargetId of mapping.repair_target_ids || []) {
      if (!repairTargetIds.has(repairTargetId)) errors.push(`${label}: repair target does not exist in scoring registry: ${repairTargetId}`);
    }
    for (const tutorialId of mapping.tutorial_ids || []) {
      if (!tutorialIds.has(tutorialId)) errors.push(`${label}: tutorial route does not exist in scoring registry: ${tutorialId}`);
    }

    if (mapping.mapping_type === "result_indicator" && !/root|上游|根因|upstream/i.test(mapping.confidence_policy)) {
      errors.push(`${label}: result_indicator mappings must state that root cause requires upstream checks`);
    }
    if ((mapping.mapping_type === "manual_first" || mapping.mapping_status === "review_only") && !/manual|人工|review|复核/i.test(mapping.confidence_policy)) {
      errors.push(`${label}: manual/review mappings must state manual or review-first policy`);
    }
    if (deferred && ((mapping.tutorial_ids || []).length || (mapping.repair_target_ids || []).length)) {
      errors.push(`${label}: deferred mappings must not recommend v1 tutorials or repair targets`);
    }
  }
}
