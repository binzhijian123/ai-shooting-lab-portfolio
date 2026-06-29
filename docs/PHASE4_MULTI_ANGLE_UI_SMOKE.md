# Phase 4 Multi-Angle UI Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies that real `multi_angle_evidence_packet.v1` responses from `/api/analyze-multi-angle` are visible in the browser Multi Angle card, including metadata-only `view_quality_assessment.v1`.

It does not validate precise cross-camera frame synchronization, real frame-level multi-camera shooting quality, or high-confidence model behavior.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-ui-smoke.mjs
```

## Latest Result

```json
{
  "ok": true,
  "schema_version": "phase4_multi_angle_ui_smoke.v1",
  "source_contract": "browser_dom_multi_angle_audit_visibility",
  "viewport": {
    "width": 390,
    "height": 844
  },
  "sample_id": "synthetic_ball",
  "both": {
    "status": "multi_angle_evidence_packet.v1",
    "present_views": ["side", "front"],
    "missing_views": [],
    "row_count": 16,
    "section_count": 3,
    "sync_policy": "approximate_session_grouping_no_manual_keyframe_sync",
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "status": "approximate_only",
      "precision": "not_frame_accurate"
    },
    "view_quality_assessment": {
      "schema_version": "view_quality_assessment.v1",
      "status": "metadata_ready",
      "risk_factor_count": 1
    }
  },
  "side_only": {
    "status": "multi_angle_evidence_packet.v1",
    "present_views": ["side"],
    "missing_views": ["front"],
    "row_count": 11,
    "section_count": 5,
    "sync_policy": "approximate_session_grouping_no_manual_keyframe_sync",
    "sync_assessment": {
      "schema_version": "sync_assessment.v1",
      "status": "missing_required_view",
      "precision": "not_frame_accurate"
    },
    "view_quality_assessment": {
      "schema_version": "view_quality_assessment.v1",
      "status": "insufficient",
      "risk_factor_count": 1
    }
  },
  "boundaries": [
    "approximate_grouping_only_no_precise_sync",
    "sync_assessment_not_frame_accurate",
    "view_quality_metadata_only",
    "synthetic_sample_only_no_real_multi_angle_quality"
  ]
}
```

## Verified UI Contract

- The script uploads the authorized synthetic sample twice and calls `/api/analyze-multi-angle`.
- The browser renders `#multiAngleStatus` as `multi_angle_evidence_packet.v1`.
- front+side renders present views, Metric Views, Signal Views, Rule Views, sync assessment, `view_quality_assessment.v1`, `metadata_and_evidence_context_only_not_real_frame_quality`, `view_quality_front_side_metadata_ready`, view evidence rows, key metric source rows, and approximate sync policy copy.
- side-only renders the missing front view, `missing_front_view`, the missing-view impact section, sync assessment, `view_quality_assessment.v1`, `view_quality_missing_front`, and missing counts.
- The UI must not claim precise sync; it remains approximate session grouping only.
- The UI must not claim real frame-level view-quality analysis; the view-quality layer is metadata/evidence-context only.
