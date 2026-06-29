# Mobile Layout Smoke

Updated: 2026-06-15

## Scope

This smoke test verifies the local Web prototype has a mobile-safe layout baseline.

It does not certify native iOS, mini-program, PWA packaging, or real-device camera/upload behavior.

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-layout-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-browser-smoke.mjs
```

## Checked Contract

- The page keeps the viewport meta tag.
- At `max-width: 900px`, the main workspace becomes single-column.
- `side-rail` moves back to `grid-column: 1` and `grid-row: auto`, avoiding an implicit second column on phones.
- Evidence, lab, feedback, cleanup, knowledge, and multi-angle audit rows collapse to one column.
- The video stage uses a stable 16:9 aspect ratio.
- At `max-width: 560px`, keyframes collapse to one column.
- In headless Chrome at 390x844, the page has no horizontal overflow, no browser error events, and the main workspace, side rail, evidence panel, and keyframes compute to one column.

## Latest Result

```json
{
  "ok": true,
  "schema_version": "mobile_layout_smoke.v1",
  "source_contract": "mobile_first_local_web_prototype",
  "breakpoints": ["max-width: 900px", "max-width: 560px"]
}
```

```json
{
  "ok": true,
  "schema_version": "mobile_browser_smoke.v1",
  "source_contract": "chrome_headless_390x844_layout_baseline",
  "viewport": {
    "width": 390,
    "height": 844,
    "client_width": 390,
    "scroll_width": 390,
    "horizontal_overflow": false
  },
  "checks": {
    "workspace_single_column": true,
    "side_rail_single_column": true,
    "evidence_single_column": true,
    "keyframes_single_column": true,
    "video_aspect_ratio": "16 / 9",
    "browser_errors": 0
  }
}
```

## Remaining Gap

This is a source-contract and headless browser-width baseline. It still needs real mobile device checks for video file picking, local playback, upload latency, touch ergonomics, and visual density.
