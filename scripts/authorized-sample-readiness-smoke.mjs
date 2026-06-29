import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAuthorizedSampleReadiness } from "../server/sampleReadinessPolicy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const manifest = JSON.parse(await readFile(path.join(root, "data", "sample_manifest.json"), "utf8"));
const fixtures = JSON.parse(await readFile(path.join(root, "data", "fixtures", "authorized-sample-readiness-fixtures.json"), "utf8"));

assert(fixtures.schema_version === "authorized_sample_readiness_fixtures.v1", "fixture schema mismatch");
assert(fixtures.source_contract === "metadata_only_no_real_video_file_access", "fixture source contract mismatch");

const currentAudit = auditAuthorizedSampleReadiness(manifest);
assert(currentAudit.source_contract === "metadata_only_no_video_file_access", "current audit source contract mismatch");
assert(currentAudit.ready_sample_count === 0, "current manifest must not contain ready real or representative samples");
assert(currentAudit.status === "waiting_for_authorized_samples", "current manifest readiness status mismatch");
assert(currentAudit.errors.length === 0, `current manifest readiness errors: ${JSON.stringify(currentAudit.errors)}`);

const validAudit = auditAuthorizedSampleReadiness(fixtures.valid_manifest);
assert(validAudit.ready_sample_count === 1, "valid readiness fixture should have one ready sample");
assert(validAudit.errors.length === 0, `valid readiness fixture errors: ${JSON.stringify(validAudit.errors)}`);

const invalidResults = [];
for (const testCase of fixtures.invalid_cases || []) {
  const mutatedManifest = structuredClone(fixtures.valid_manifest);
  for (const [dottedPath, value] of Object.entries(testCase.mutations || {})) {
    setPath(mutatedManifest.samples[0], dottedPath, value);
  }
  const audit = auditAuthorizedSampleReadiness(mutatedManifest);
  const errorCodes = audit.errors.map((error) => error.code);
  for (const expected of testCase.expected_error_codes || []) {
    assert(errorCodes.includes(expected), `${testCase.id} missing expected error ${expected}; got ${errorCodes.join(", ")}`);
  }
  invalidResults.push({
    id: testCase.id,
    expected_error_codes: testCase.expected_error_codes,
    actual_error_codes: errorCodes
  });
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "authorized_sample_readiness_smoke.v1",
  source_contract: "metadata_only_no_real_video_file_access",
  current_manifest: {
    status: currentAudit.status,
    candidate_sample_count: currentAudit.candidate_sample_count,
    ready_sample_count: currentAudit.ready_sample_count
  },
  valid_fixture: {
    status: validAudit.status,
    ready_sample_count: validAudit.ready_sample_count,
    ready_sample_id: validAudit.ready_samples[0]?.id || null
  },
  invalid_cases: invalidResults,
  required_metadata: validAudit.required_metadata,
  forbidden_scope: validAudit.forbidden_scope,
  boundaries: [
    "does_not_read_or_stat_real_video_files",
    "current_manifest_keeps_real_samples_absent",
    "local_only_authorized_sample_validation",
    "forbidden_public_cloud_training_uses_preserved"
  ]
}, null, 2));

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== "object") current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function assert(condition, message) {
  if (!condition) throw new Error(`authorized sample readiness smoke failed: ${message}`);
}
