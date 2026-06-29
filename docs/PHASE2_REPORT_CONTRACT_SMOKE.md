# Phase 2 Report Contract Smoke

Updated: 2026-06-14

## Scope

This smoke test verifies that `/api/coach-report` keeps the legacy `report` response while also returning `player_report.v1` and `lab_report.v1`.

It uses the synthetic sample from `data/sample_manifest.json` and disables external or heavy model paths. It does not validate real player diagnosis quality.

## Command Context

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-contract-smoke.mjs
```

## Result

```json
{
  "mode": "evidence_insufficient_fallback",
  "legacy_report": true,
  "player_report_version": "player_report.v1",
  "player_status": "review_only",
  "player_evidence_refs": 0,
  "player_uncertainties": 17,
  "lab_report_version": "lab_report.v1",
  "lab_evidence_packet_version": "evidence_packet.v1",
  "lab_metric_count": 19,
  "lab_signal_count": 4,
  "lab_rule_count": 1,
  "lab_missing_evidence_count": 5,
  "validation_errors": []
}
```

## Interpretation

- Existing consumers can continue reading `report`.
- Product-facing clients can start reading `player_report`.
- Internal tooling can start reading `lab_report`.
- Low-confidence synthetic input stays `review_only`.
- Low-evidence player output cites `missing_evidence` through uncertainties instead of inventing a diagnosis.
- Frontend source contains the current player/lab report section bindings.
- Remaining gaps are page-level UX separation, mobile polish, and real sample readability, not backend contract generation.
