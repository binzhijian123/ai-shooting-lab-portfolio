# Phase 1 Smoke Report

Updated: 2026-06-27

## Scope

This smoke test verifies the Phase 1 local baseline with the synthetic sample listed in `data/sample_manifest.json`.

It does not validate real player diagnosis quality, stable ball trajectory, make/miss judgment, cloud sync, login, or scoring.

## Command Context

The current repeatable smoke command is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-smoke.mjs
```

The page sample-entry smoke command is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-ui-smoke.mjs
```

The authorized real/representative sample metadata readiness command is:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-smoke.mjs
```

The synthetic browser-playable sample can be regenerated locally on macOS:

```bash
swift scripts/generate-synthetic-sample.swift data/synthetic_ball.mp4
```

The script starts a temporary local server with external and heavy model paths disabled:

```bash
PORT=<free port> DEEPSEEK_API_KEY= YOLO_COMMAND= RTMPOSE_COMMAND= node server/index.mjs
```

The local Node path used in this environment was:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

## Sample

- Manifest: `data/sample_manifest.json`
- Sample ID: `synthetic_ball`
- File: `data/synthetic_ball.mp4`
- Source type: synthetic
- Browser metadata baseline: 640x360, 30fps, 2.4s
- Allowed use: local analysis and local acceptance test
- Forbidden use: public showcase, external distribution, cloud storage, model training

## Result

Upload-path smoke:

```json
{
  "upload": {
    "ok": true,
    "bytes": 36433,
    "metadata_status": "adapter_not_configured"
  },
  "evidence": {
    "schema_version": "evidence_packet.v1",
    "analysis_mode": "fallback_contract",
    "confidence": "low",
    "missing_evidence_count": 6,
    "object_detection_layer": "adapter_not_configured",
    "precision_layer": "adapter_not_configured"
  },
  "coach": {
    "mode": "evidence_insufficient_fallback",
    "validation_errors": []
  },
  "saved": {
    "ok": true,
    "memory_status": "short_term_review",
    "long_term_written": false
  },
  "memory": {
    "trend_source": "long_term_only"
  }
}
```

Sample UI/API smoke:

```json
{
  "ok": true,
  "schema_version": "phase1_sample_ui_smoke.v1",
  "sample_id": "synthetic_ball",
  "sample_video": {
    "fps": 30,
    "duration_ms": 2400,
    "dimensions": {
      "width": 640,
      "height": 360
    }
  },
  "video_range_status": 206,
  "suffix_range_status": 206,
  "open_ended_range_status": 206,
  "invalid_range_status": 416,
  "invalid_range_accept_ranges": "bytes",
  "evidence": {
    "schema_version": "evidence_packet.v1",
    "video_layer": "local_authorized_sample_ready",
    "max_report_confidence": "low",
    "object_detection_layer": "adapter_not_configured"
  },
  "report_contracts": {
    "player_report": "player_report.v1",
    "lab_report": "lab_report.v1"
  }
}
```

Authorized sample readiness smoke:

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

Browser UI check on `http://localhost:4197`:

```json
{
  "sampleStatus": "synthetic_ball 已加载；not_for_player_diagnosis",
  "memoryStatus": "short_term_review",
  "cameraView": "side_back_candidate",
  "fileInfo": "synthetic_ball.mp4 · 00:02.40 · 640x360",
  "videoWidth": 640,
  "videoHeight": 360,
  "duration": 2.4,
  "reportMode": "evidence_insufficient_fallback · 本地降级",
  "ballTrajectoryStatus": "not_available",
  "qualityBadge": "low"
}
```

## Interpretation

- Upload path works with the manifest sample.
- The page can list and load a local authorized sample without exposing absolute filesystem paths.
- The sample video endpoint supports normal, suffix, and open-ended byte-range reads for browser playback, and returns `416` with `accept-ranges: bytes` for invalid ranges.
- The synthetic sample is browser-playable and keeps the UI on `short_term_review`.
- The sample analysis path can generate `evidence_packet.v1` without copying the sample into `data/uploads`.
- `evidence_packet.v1` can be generated without external services.
- The authorized sample readiness gate now defines the metadata required before a real or representative sample can enter local Phase 1 validation.
- The readiness gate is metadata-only and does not read, stat, upload, decode, or analyze real video files.
- Low-confidence fallback behavior works when adapters are not configured.
- Coach report validation accepts the fallback report.
- Session saving works and does not write the synthetic low-confidence sample to long-term memory.
- The script cleans up the test session and current upload before exit.

## Remaining Phase 1 Gap

Phase 1 is not complete until 1-3 authorized real or representative shooting samples are provided, pass the readiness metadata gate, and are tested through the normal local model adapter path. The current smokes prove the local acceptance harness and the authorization gate, not real-sample diagnostic quality.
