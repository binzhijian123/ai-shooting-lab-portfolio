# Phase 7 Privacy Boundary Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies the local-only privacy boundary that can be implemented before choosing login, cloud storage, or deployment providers:

- `GET /api/privacy-boundary`.
- Frontend privacy boundary card.
- Explicit local raw-video storage boundary.
- Explicit cloud-sync not implemented state.
- Explicit default forbidden uses for real school-team video.
- Local SQLite single-session deletion and local-user session batch deletion boundary.
- Current uploaded raw-video file deletion boundary.
- Controlled historical upload-file inventory and one-by-one deletion boundary, including a missing-file path that must not claim deletion.
- Retention-based upload cleanup preview and manual execution boundary.
- Local JSON export for SQLite sessions, memory summary, and upload inventory metadata.

This does not implement login, accounts, cloud sync, organization permissions, background automatic retention cleanup, authorization withdrawal, cloud export/deletion workflows, raw video export, or a production privacy policy.

## API Smoke

Repeatable command:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-smoke.mjs
```

```json
{
  "schema": "privacy_boundary.v1",
  "raw_video": "local_uploads_only",
  "cloud_sync": "not_implemented",
  "raw_video_to_report_model": false,
  "contains_real_school_team_video": false,
  "forbidden": [
    "public_showcase",
    "external_distribution",
    "cloud_storage",
    "model_training"
  ]
}
```

Latest repeatable smoke result:

```json
{
  "schema_version": "phase7_privacy_smoke.v1",
  "boundary": {
    "schema_version": "privacy_boundary.v1",
    "raw_video": "local_uploads_only",
    "cloud_sync": "not_implemented",
    "raw_video_to_report_model": false,
    "forbidden": [
      "public_showcase",
      "external_distribution",
      "cloud_storage",
      "model_training"
    ]
  },
  "privacy_export": {
    "schema_version": "privacy_export.v1",
    "scope": "local_json_export_no_raw_video_bytes",
    "raw_video_bytes": "excluded",
    "upload_inventory_schema": "upload_file_inventory.v1",
    "redaction": "redacted",
    "removed_field_count": 10
  },
  "upload_delete": {
    "deleted": true,
    "exists_after_delete": false
  },
  "local_user_delete": {
    "deleted": 3,
    "scope": "local_sqlite_sessions_only",
    "raw_video_deleted": false,
    "sessions_after_delete": 0
  },
  "controlled_file_delete": {
    "deleted": true,
    "exists_after_delete": false
  },
  "missing_file_delete": {
    "status": 404,
    "deleted": false,
    "error": "upload_file_not_found"
  },
  "unmanaged_file_boundary": {
    "inventory_visible": false,
    "delete_status": 400,
    "deleted": false,
    "exists_after_delete_attempt": true
  },
  "retention_cleanup": {
    "dry_run": true,
    "dry_found_temp": true,
    "dry_found_unmanaged": false,
    "run_deleted_temp": true,
    "exists_after_run": false,
    "unmanaged_exists_after_run": true
  }
}
```

## Browser Smoke

Repeatable command:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-ui-smoke.mjs
```

```json
{
  "schema_version": "phase7_privacy_ui_smoke.v1",
  "source_contract": "browser_dom_privacy_boundary_export_upload_cleanup",
  "privacy": {
    "status": "local only",
    "local_raw_video_visible": true,
    "local_sqlite_visible": true,
    "cloud_sync_not_implemented_visible": true,
    "forbidden_model_training_visible": true
  },
  "export": {
    "schema_version": "privacy_export.v1",
    "scope": "local_json_export_no_raw_video_bytes",
    "raw_video_bytes": "excluded",
    "cloud_sync": "not_implemented",
    "upload_inventory_schema": "upload_file_inventory.v1",
    "redaction_local_file_paths": "redacted"
  },
  "local_user_delete": {
    "sessions_after_delete": 0,
    "result_visible": true
  },
  "upload_inventory": {
    "ui_delete_removed_file": true,
    "file_exists_after_ui_delete": false
  },
  "cleanup": {
    "dry_run_result_visible": true,
    "dry_run_kept_file": true
  }
}
```

This browser smoke starts a temporary local server, opens headless Chrome at a 390x844 viewport, creates only managed temporary files under `data/uploads/`, creates two isolated local SQLite sessions for a synthetic `user_id`, verifies that the privacy card visibly shows local-only storage, SQLite memory, cloud-sync not implemented, forbidden uses, JSON export copy, local-user session deletion controls, upload-file delete controls, and retention cleanup controls, then deletes the isolated local user's SQLite sessions and the controlled upload file through the UI. The dry-run cleanup path must show candidates without deleting the managed file.

## Upload Delete Smoke

The smoke uploaded `data/synthetic_ball.mp4` as a temporary local upload, confirmed the new file existed in `data/uploads/`, then deleted it through `DELETE /api/uploads/:upload_id`.

```json
{
  "upload_status": 200,
  "saved_file_detected": true,
  "saved_exists": true,
  "delete_status": 200,
  "deleted_ok": true,
  "deleted_flag": true,
  "exists_after_delete": false
}
```

Historical controlled upload-file smoke created a temporary file named `upload_<timestamp>_abcdef123456.mp4`, verified it appeared in `GET /api/upload-files`, then deleted it with `DELETE /api/upload-files/:file_name`.

```json
{
  "schema": "upload_file_inventory.v1",
  "found_before": true,
  "delete_status": 200,
  "deleted_ok": true,
  "exists_after_delete": false,
  "found_after": false
}
```

Deleting a managed upload filename that is already absent must return `404` and must not report `deleted=true`.

Non-managed local files under `data/uploads/` must not appear in `GET /api/upload-files`, must return `400 invalid_upload_file_name` from `DELETE /api/upload-files/:file_name`, and must remain on disk after retention cleanup. This prevents the local cleanup UI from becoming a broad filesystem deletion tool.

Retention cleanup smoke created an old temporary upload file, previewed candidates with `dry_run=true`, then executed deletion with `dry_run=false`.

```json
{
  "dry_schema": "upload_cleanup.v1",
  "dry_run": true,
  "dry_found_temp": true,
  "dry_found_unmanaged": false,
  "exists_after_dry": true,
  "run_dry_run": false,
  "run_deleted_temp": true,
  "exists_after_run": false,
  "unmanaged_exists_after_run": true,
  "deleted_count": 2
}
```

Local JSON export smoke:

```json
{
  "schema_version": "privacy_export.v1",
  "scope": "local_json_export_no_raw_video_bytes",
  "raw_video_bytes": "excluded",
  "cloud_sync": "not_implemented",
  "has_sessions": true,
  "upload_inventory_schema": "upload_file_inventory.v1",
  "export_redaction": {
    "raw_video_bytes": "excluded",
    "local_file_paths": "redacted",
    "forbidden_fields": [
      "raw_video",
      "base64_video",
      "video_path",
      "uploaded_video",
      "full_transcript",
      "file_path",
      "path",
      "data_url"
    ]
  }
}
```

Local user SQLite session deletion smoke:

```json
{
  "endpoint": "DELETE /api/users/:user_id/sessions",
  "deleted": 3,
  "scope": "local_sqlite_sessions_only",
  "raw_video_deleted": false,
  "sessions_after_delete": 0
}
```

Follow-up browser smoke:

```json
{
  "deleteUploadButton": true,
  "deleteUploadDisabled": true,
  "deletePairedUploadButton": true,
  "deletePairedUploadDisabled": true,
  "cleanupDaysInput": true,
  "previewButton": true,
  "runButton": true,
  "hasDeleteUserSessionsButton": true,
  "uploadFileRows": 6,
  "uploadFileDeleteButtons": 6,
  "sessionDeleteButtons": 5,
  "privacyStatus": "local only",
  "blocking_events": []
}
```

Static frontend resource smoke for local JSON export:

```json
{
  "main_js_has_export_button": true,
  "main_js_calls_privacy_export": true,
  "api_schema": "privacy_export.v1",
  "raw_video_bytes": "excluded"
}
```

## Interpretation

- The product now exposes privacy boundaries in the running local prototype instead of leaving them only in docs.
- Raw video remains local uploads only.
- Report generation is documented as structured evidence packet only; raw video is not sent to the report model.
- Cloud sync is explicitly not implemented.
- Local SQLite sessions can be deleted one by one, and all SQLite sessions for a local `user_id` can be deleted in one local-only action.
- Local user session deletion does not delete raw video files.
- Current-process local uploads can be deleted when the app still has the `upload_id`; delete paths are constrained to `data/uploads/`.
- Controlled historical upload files can be listed and deleted one by one by file name; delete paths are constrained to `data/uploads/`.
- Retention cleanup is manual and dry-run first; no background deletion runs by itself.
- Local JSON export includes SQLite sessions, memory summary, and upload inventory metadata, but excludes raw video bytes.
- Local JSON export now recursively removes session fields that could expose raw video, embedded data, or local filesystem paths, including `video_path`, `uploaded_video`, `file_path`, `path`, `absolutePath`, and `data_url`; the smoke injects a synthetic leak-shaped session and verifies those keys/values are absent from both exported sessions and memory summary.
- The repeatable API and browser smokes create only controlled temporary files under `data/uploads` and remove them before exit.

## Remaining Phase 7 Gap

- Login and account identity are not implemented.
- Cloud storage provider, region, retention, and deletion policy are not selected.
- Real school-team video authorization, background automatic retention cleanup, authorization withdrawal, cloud export/deletion workflows, and raw video export are not implemented.
- This is still a local prototype privacy boundary, not a final legal policy.
