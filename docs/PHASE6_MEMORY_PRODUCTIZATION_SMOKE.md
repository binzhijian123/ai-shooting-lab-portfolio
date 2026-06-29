# Phase 6 Memory Productization Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies the first local-only product slice for personal memory:

- `GET /api/memory-summary` returns a local profile.
- Training goals are aggregated from local SQLite sessions.
- Long-term recurring candidate signals are summarized.
- Trend policy explicitly uses long-term sessions only.
- The frontend memory card renders profile, goals, trend source, and historical candidate signals.
- Local SQLite sessions can be deleted by `session_id`.
- The frontend renders recent local sessions with delete buttons.

This does not implement login, accounts, cloud sync, organization permissions, cross-device recovery, uploaded video file deletion, or account-level deletion.

## API Smoke

Repeatable command:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-smoke.mjs
```

```json
{
  "user_id": "local_user_001",
  "profile_keys": [
    "user_id",
    "storage",
    "primary_training_goal",
    "latest_camera_view",
    "latest_confidence"
  ],
  "training_goals_is_array": true,
  "recurring_signals_is_array": true,
  "confidence_policy": {
    "trend_source": "long_term_only",
    "review_sessions_excluded": 28,
    "low_confidence_sessions_require_manual_promotion": true
  },
  "trend_metric": "ball_lift_knee_delta_ms"
}
```

Latest repeatable smoke result:

```json
{
  "schema_version": "phase6_memory_smoke.v1",
  "saved": {
    "long_term_written": [true, true],
    "review_long_term_written": false
  },
  "memory": {
    "session_count": 3,
    "long_term_session_count": 2,
    "review_session_count": 1,
    "trend_source": "long_term_only",
    "review_sessions_excluded": 1,
    "trend_values": [220, 120],
    "trend_delta_ms": -100,
    "trend_direction": "improving",
    "recurring_signal_count": 2
  },
  "cleanup": {
    "deleted_count": 3,
    "after_delete_session_count": 0
  }
}
```

## Browser UI Smoke

Repeatable command:

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-ui-smoke.mjs
```

Latest repeatable browser result:

```json
{
  "schema_version": "phase6_memory_ui_smoke.v1",
  "source_contract": "browser_dom_memory_card_local_sqlite_visibility",
  "memory": {
    "long_term_session_count": 2,
    "review_session_count": 1,
    "trend_source": "long_term_only",
    "review_sessions_excluded": 1,
    "trend_values": [220, 120],
    "trend_delta_ms": -100,
    "trend_direction": "improving"
  },
  "ui": {
    "chart_bar_count": 2,
    "pill_count": 2,
    "count_text": "2 long-term / 1 review"
  },
  "cleanup": {
    "deleted_count": 3,
    "after_delete_session_count": 0
  }
}
```

The browser UI smoke uses an isolated `phase6_ui_smoke_*` user, renders that user's memory summary through localhost-only test hooks, and deletes all synthetic sessions before exit.

## Delete Smoke

The smoke created a temporary session named `delete_smoke_<timestamp>`, then deleted it through `DELETE /api/sessions/:session_id`.

```json
{
  "saved_ok": true,
  "delete_status": 200,
  "deleted_ok": true,
  "deleted_count": 1,
  "existed_before": true,
  "exists_after": false
}
```

Follow-up browser smoke:

```json
{
  "sessionListExists": true,
  "sessionRows": 5,
  "deleteButtons": 5,
  "memoryDetails": true,
  "privacyStatus": "local only",
  "blocking_events": []
}
```

## Interpretation

- The memory system is now more than raw session storage: it exposes a local user profile, training goals, historical candidate signals, and trend filtering policy.
- Trend data is still local-only SQLite.
- Review sessions remain visible for context but are excluded from long-term trend calculation.
- Recurring signals and trend values are verified from long-term sessions only in the repeatable smoke.
- The browser UI smoke verifies that profile, trend source, review exclusion, training goal, recurring signal, trend delta, and two long-term trend bars are visible in the actual DOM.
- Users can delete local SQLite sessions from the recent-record list.

## Remaining Phase 6 Gap

- There is no editable user profile.
- There is no account identity, login, cloud sync, or cross-device restore.
- Deleting a session does not delete uploaded video files.
- Low-confidence promotion is still a manual UI choice, not a reviewed workflow.
