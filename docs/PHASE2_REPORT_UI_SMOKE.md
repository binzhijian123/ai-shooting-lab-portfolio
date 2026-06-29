# Phase 2 Report UI Browser Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies that `player_report.v1`, `lab_report.v1`, and the `Evidence Trace` fields are visible in the browser UI, not only returned by `/api/coach-report`.

It uses the local authorized `synthetic_ball` sample and does not read real school-team video.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-ui-browser-smoke.mjs
```

## Checked Contract

- Starts a temporary local server with DeepSeek, YOLO, and RTMPose disabled.
- Opens headless Chrome at a 390x844 viewport.
- Loads the authorized synthetic sample through the page UI.
- Clicks the page analysis button to generate evidence and report.
- Verifies browser DOM contains `球员版报告`, `实验室版摘要`, `Evidence Trace`, `player_report.v1`, `lab_report.v1`, `signal_id`, `metric_id`, `rule_id`, `missing_evidence`, model status, and adapter fallback.
- Deletes any SQLite session created by this smoke run.

## Latest Result

```json
{
  "ok": true,
  "schema_version": "phase2_report_ui_browser_smoke.v1",
  "source_contract": "browser_dom_report_split_player_lab",
  "sections": {
    "player_report": true,
    "lab_report": true,
    "evidence_trace": true
  },
  "visible_contracts": {
    "player_report_v1": true,
    "lab_report_v1": true,
    "signal_id": true,
    "metric_id": true,
    "rule_id": true,
    "missing_evidence": true,
    "model_status": true,
    "adapter_fallback": true
  },
  "cleanup": {
    "new_session_count": 1,
    "deleted_session_count": 1
  }
}
```

## Remaining Gap

This is a browser DOM contract smoke. It still does not prove real-player report readability, final mobile visual density, or diagnosis quality on authorized real shooting footage.
