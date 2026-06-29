#!/usr/bin/env python3
"""Build the canonical 2020+ source inventory from the verified link/date CSV."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = PROJECT_ROOT / "outputs" / "link_dates_2020_plus.csv"
DEFAULT_INVENTORY = PROJECT_ROOT / "inputs" / "source_inventory_2020_plus.csv"
DEFAULT_NEEDS_TRANSCRIPT = PROJECT_ROOT / "outputs" / "needs_transcript.json"
DEFAULT_STATUS = PROJECT_ROOT / "outputs" / "transcript_status_2020_plus.json"


FIELDNAMES = [
    "source_id",
    "creator",
    "platform",
    "source_url",
    "title",
    "published_at",
    "status",
    "transcript_path",
    "notes",
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a 2020+ Douyin source inventory and transcript requirement list."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--needs-transcript", type=Path, default=DEFAULT_NEEDS_TRANSCRIPT)
    parser.add_argument("--status", type=Path, default=DEFAULT_STATUS)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    rows = list(csv.DictReader(args.source.open(encoding="utf-8")))
    if not rows:
        raise SystemExit(f"No rows found in {args.source}")

    inventory_rows = []
    needs_items = []
    for row in rows:
        video_id = row["id"].strip()
        source_id = f"douyin_{video_id}"
        transcript_path = f"outputs/transcripts/{source_id}.txt"
        title = (row.get("text") or "").strip()
        published_at = (row.get("create_time_cst") or row.get("date_cst") or "").strip()
        item = {
            "source_id": source_id,
            "creator": "waveball",
            "platform": "douyin",
            "source_url": row["url"].strip(),
            "title": title,
            "published_at": published_at,
            "status": "needs_transcript",
            "transcript_path": transcript_path,
            "notes": (
                "Caption/title is available in the source CSV, but a full legally obtained "
                "transcript is required before rule-card distillation."
            ),
        }
        inventory_rows.append(item)
        needs_items.append(
            {
                "source_id": source_id,
                "source_url": item["source_url"],
                "creator": item["creator"],
                "title": title,
                "published_at": published_at,
                "transcript_path": transcript_path,
                "reason": "needs legally obtained full transcript; title/caption only is insufficient",
            }
        )

    args.inventory.parent.mkdir(parents=True, exist_ok=True)
    with args.inventory.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(inventory_rows)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_csv": str(args.source.relative_to(PROJECT_ROOT)),
        "source_count": len(inventory_rows),
        "date_min": min(row["date_cst"] for row in rows),
        "date_max": max(row["date_cst"] for row in rows),
        "policy": "Do not generate final rule cards without full transcripts.",
        "items": needs_items,
    }
    args.needs_transcript.parent.mkdir(parents=True, exist_ok=True)
    args.needs_transcript.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    status = {
        "generated_at": payload["generated_at"],
        "source_csv": payload["source_csv"],
        "inventory": str(args.inventory.relative_to(PROJECT_ROOT)),
        "source_count": len(inventory_rows),
        "needs_transcript": len(needs_items),
        "ready_for_card_generation": 0,
        "cards_generated": 0,
    }
    args.status.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
