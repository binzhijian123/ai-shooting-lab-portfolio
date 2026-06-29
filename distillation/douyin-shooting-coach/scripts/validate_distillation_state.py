#!/usr/bin/env python3
"""Validate the current Douyin shooting distillation state."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LINKS = PROJECT_ROOT / "outputs" / "link_dates_2020_plus.csv"
DEFAULT_INVENTORY = PROJECT_ROOT / "inputs" / "source_inventory_2020_plus.csv"
DEFAULT_STATUS = PROJECT_ROOT / "outputs" / "transcript_status_2020_plus.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate source inventory, transcript readiness, and cards.")
    parser.add_argument("--links", type=Path, default=DEFAULT_LINKS)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--status", type=Path, default=DEFAULT_STATUS)
    return parser


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def main() -> int:
    args = build_parser().parse_args()
    links = list(csv.DictReader(args.links.open(encoding="utf-8")))
    inventory = list(csv.DictReader(args.inventory.open(encoding="utf-8")))

    link_urls = [row["url"] for row in links]
    inventory_urls = [row["source_url"] for row in inventory]
    missing_in_inventory = sorted(set(link_urls) - set(inventory_urls))
    extra_in_inventory = sorted(set(inventory_urls) - set(link_urls))

    transcript_ready = []
    audio_ready = []
    card_ready = []
    for row in inventory:
        transcript = PROJECT_ROOT / row["transcript_path"]
        audio = PROJECT_ROOT / "outputs" / "audio" / f"{row['source_id']}.mp3"
        card = PROJECT_ROOT / "outputs" / "cards" / f"{row['source_id']}.md"
        if audio.exists() and audio.stat().st_size > 0:
            audio_ready.append(row["source_id"])
        if transcript.exists() and transcript.stat().st_size > 0:
            transcript_ready.append(row["source_id"])
        if card.exists() and card.stat().st_size > 0:
            card_ready.append(row["source_id"])

    status = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "links_csv": rel(args.links),
        "inventory": rel(args.inventory),
        "link_count": len(links),
        "inventory_count": len(inventory),
        "duplicate_link_urls": len(link_urls) - len(set(link_urls)),
        "missing_in_inventory": missing_in_inventory,
        "extra_in_inventory": extra_in_inventory,
        "date_min": min(row["date_cst"] for row in links) if links else None,
        "date_max": max(row["date_cst"] for row in links) if links else None,
        "audio_ready": len(audio_ready),
        "transcripts_ready": len(transcript_ready),
        "cards_ready": len(card_ready),
        "needs_transcript": len(inventory) - len(transcript_ready),
        "ready_source_ids": transcript_ready[:20],
        "valid": not missing_in_inventory and not extra_in_inventory and len(links) == len(inventory),
    }
    args.status.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0 if status["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
