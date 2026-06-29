# Authorized Sample Readiness

Updated: 2026-06-15

## Scope

This readiness gate defines what must be true before an authorized real or representative shooting sample can be used for local Phase 1 validation.

The gate is metadata-only. It does not read, stat, upload, decode, thumbnail, or analyze real video files. Current `data/sample_manifest.json` still contains only the synthetic `synthetic_ball` sample.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-smoke.mjs
```

API/frontend binding smoke:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-ui-smoke.mjs
```

It is also included in:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mvp-acceptance-smoke.mjs
```

## Required Metadata

For `source_type=representative_authorized` or `source_type=real_school_team_authorized`, the sample metadata must include:

- `authorization.status=authorized`
- `authorization.scope` includes `local_analysis` and `local_acceptance_test`
- `authorization.scope` does not include `public_showcase`, `external_distribution`, `cloud_storage`, or `model_training`
- `authorization.provider`
- `authorization.subject_authorization.status=documented`
- `authorization.subject_authorization.authority`
- `authorization.subject_authorization.recorded_at`
- `authorization.retention.storage=local_only`
- `authorization.retention.delete_raw_video_after_days`
- `authorization.retention.review_by`
- `privacy.allow_public_showcase=false`
- `privacy.allow_external_distribution=false`
- `privacy.allow_cloud_storage=false`
- `privacy.allow_model_training=false`
- `expected_use.diagnosis_confidence=representative_validation_only` or `requires_human_review`
- `expected_use.known_limits` states no public use and representative/human-review limits

## Latest Result

```json
{
  "ok": true,
  "schema_version": "authorized_sample_readiness_smoke.v1",
  "source_contract": "metadata_only_no_real_video_file_access",
  "current_manifest": {
    "status": "waiting_for_authorized_samples",
    "candidate_sample_count": 0,
    "ready_sample_count": 0
  },
  "valid_fixture": {
    "status": "ready_for_local_authorized_sample_validation",
    "ready_sample_count": 1,
    "ready_sample_id": "authorized_representative_side_001"
  }
}
```

API/frontend binding result:

```json
{
  "ok": true,
  "schema_version": "authorized_sample_readiness_ui_smoke.v1",
  "source_contract": "api_and_frontend_binding_metadata_only",
  "endpoint": {
    "schema_version": "authorized_sample_readiness_audit.v1",
    "status": "waiting_for_authorized_samples",
    "candidate_sample_count": 0,
    "ready_sample_count": 0,
    "error_count": 0
  }
}
```

## Interpretation

- The current manifest has no real or representative authorized samples ready for Phase 1 real-sample validation.
- The fixture proves the metadata contract for a future authorized sample.
- Invalid fixture cases verify missing subject authorization, forbidden cloud scope, missing retention review date, public showcase permission, and over-strong diagnosis confidence all fail.
- `GET /api/authorized-sample-readiness` exposes the readiness result to the local web app.
- The upload panel shows a `样例授权门禁` card with status, candidate count, ready count, required scopes, and metadata-only boundary copy.

## Remaining Gap

This gate does not complete real-sample validation. Phase 1 still needs 1-3 explicitly authorized real or representative videos to be provided by the user, added to the manifest with the required metadata, and tested through the normal local adapter/report/memory path.
