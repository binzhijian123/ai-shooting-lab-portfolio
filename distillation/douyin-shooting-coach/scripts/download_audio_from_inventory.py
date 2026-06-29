#!/usr/bin/env python3
"""Download MP3 audio for source inventory rows using yt-dlp.

This is intentionally link-list based. It does not crawl profiles, use cookies, or
try to bypass platform restrictions.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import imageio_ffmpeg
import yt_dlp


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INVENTORY = PROJECT_ROOT / "inputs" / "source_inventory_2020_plus.csv"
DEFAULT_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audio"
DEFAULT_LOG = PROJECT_ROOT / "outputs" / "logs" / "audio_downloads.jsonl"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download MP3 audio for Douyin source inventory rows.")
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    return parser


def read_inventory(path: Path) -> list[dict[str, str]]:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    if not rows:
        raise SystemExit(f"No inventory rows found: {path}")
    return rows


def append_log(payload: dict[str, Any]) -> None:
    DEFAULT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with DEFAULT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def download_audio(row: dict[str, str], audio_dir: Path, *, force: bool, quiet: bool) -> dict[str, Any]:
    source_id = row["source_id"]
    if "/video/" not in row["source_url"]:
        return {
            "source_id": source_id,
            "status": "skipped_non_video",
            "source_url": row["source_url"],
            "reason": "Only /video/ URLs are eligible for audio download and ASR.",
        }

    output_path = audio_dir / f"{source_id}.mp3"
    if output_path.exists() and output_path.stat().st_size > 0 and not force:
        return {"source_id": source_id, "status": "skipped_existing", "audio_path": str(output_path)}

    temp_template = str(audio_dir / f"{source_id}.%(ext)s")
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": temp_template,
        "noplaylist": True,
        "quiet": quiet,
        "no_warnings": quiet,
        "noprogress": quiet,
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "5",
            }
        ],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(row["source_url"], download=True)

    if not output_path.exists():
        raise RuntimeError(f"expected audio not found: {output_path}")
    return {
        "source_id": source_id,
        "status": "downloaded",
        "source_url": row["source_url"],
        "audio_path": str(output_path),
        "bytes": output_path.stat().st_size,
    }


def main() -> int:
    args = build_parser().parse_args()
    rows = read_inventory(args.inventory)
    rows = rows[args.offset :]
    if args.limit is not None:
        rows = rows[: args.limit]

    args.audio_dir.mkdir(parents=True, exist_ok=True)
    failures = 0
    results = []
    for row in rows:
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            result = download_audio(row, args.audio_dir, force=args.force, quiet=args.quiet)
            result["started_at"] = started_at
            result["finished_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:  # noqa: BLE001 - record per-link failures and continue.
            failures += 1
            result = {
                "source_id": row.get("source_id"),
                "status": "failed",
                "source_url": row.get("source_url"),
                "error": str(exc),
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        append_log(result)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False))

    summary = {
        "processed": len(rows),
        "downloaded_or_existing": sum(
            1 for item in results if item["status"] in {"downloaded", "skipped_existing"}
        ),
        "skipped_non_video": sum(1 for item in results if item["status"] == "skipped_non_video"),
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
