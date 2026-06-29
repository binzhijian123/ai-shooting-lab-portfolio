#!/usr/bin/env python3
"""Transcribe downloaded audio with MLX Whisper on Apple Silicon."""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import imageio_ffmpeg
import mlx_whisper


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INVENTORY = PROJECT_ROOT / "inputs" / "source_inventory_2020_plus.csv"
DEFAULT_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audio"
DEFAULT_TRANSCRIPTS_DIR = PROJECT_ROOT / "outputs" / "transcripts"
DEFAULT_SEGMENTS_DIR = PROJECT_ROOT / "outputs" / "transcript_segments"
DEFAULT_LOG = PROJECT_ROOT / "outputs" / "logs" / "mlx_transcriptions.jsonl"
DEFAULT_MODEL = "mlx-community/whisper-large-v3-mlx"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Transcribe local MP3 audio files with MLX Whisper.")
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--transcripts-dir", type=Path, default=DEFAULT_TRANSCRIPTS_DIR)
    parser.add_argument("--segments-dir", type=Path, default=DEFAULT_SEGMENTS_DIR)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--language", default="zh")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--force", action="store_true")
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


def format_timestamp(seconds: float) -> str:
    millis = int(round(seconds * 1000))
    hours, rem = divmod(millis, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def transcribe_one(
    row: dict[str, str],
    *,
    audio_dir: Path,
    transcripts_dir: Path,
    segments_dir: Path,
    model: str,
    language: str,
    force: bool,
) -> dict[str, Any]:
    ensure_ffmpeg_on_path()
    source_id = row["source_id"]
    audio_path = audio_dir / f"{source_id}.mp3"
    transcript_path = transcripts_dir / f"{source_id}.txt"
    segments_path = segments_dir / f"{source_id}.json"

    if transcript_path.exists() and transcript_path.stat().st_size > 0 and not force:
        return {
            "source_id": source_id,
            "status": "skipped_existing",
            "transcript_path": str(transcript_path),
        }
    if not audio_path.exists() or audio_path.stat().st_size == 0:
        return {"source_id": source_id, "status": "missing_audio", "audio_path": str(audio_path)}

    result = mlx_whisper.transcribe(
        str(audio_path),
        path_or_hf_repo=model,
        language=language or None,
        word_timestamps=False,
        verbose=False,
        initial_prompt="这是一段中文篮球投篮教学、投篮动作分析、发力矫正和训练建议视频。",
    )

    segments = result.get("segments", [])
    text_lines = [
        f"# Transcript: {source_id}",
        "",
        f"- URL: {row['source_url']}",
        f"- Title: {row['title']}",
        f"- Published at: {row['published_at']}",
        f"- Generated at: {datetime.now(timezone.utc).isoformat()}",
        f"- ASR: mlx-whisper",
        f"- Model: {model}",
        "",
    ]
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        if text:
            text_lines.append(
                f"[{format_timestamp(float(segment.get('start', 0)))} --> "
                f"{format_timestamp(float(segment.get('end', 0)))}] {text}"
            )

    if len(text_lines) == 8 and result.get("text"):
        text_lines.append(str(result["text"]).strip())

    transcripts_dir.mkdir(parents=True, exist_ok=True)
    segments_dir.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text("\n".join(text_lines).strip() + "\n", encoding="utf-8")
    segments_path.write_text(
        json.dumps(
            {
                "source_id": source_id,
                "source_url": row["source_url"],
                "model": model,
                "language": result.get("language"),
                "duration": result.get("duration"),
                "text": result.get("text", ""),
                "segments": segments,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "source_id": source_id,
        "status": "transcribed",
        "audio_path": str(audio_path),
        "transcript_path": str(transcript_path),
        "segments_path": str(segments_path),
        "language": result.get("language"),
        "segments": len(segments),
        "characters": len(str(result.get("text", ""))),
    }


def ensure_ffmpeg_on_path() -> None:
    """Expose imageio-ffmpeg's bundled binary as `ffmpeg` for mlx-whisper."""
    ffmpeg_source = Path(imageio_ffmpeg.get_ffmpeg_exe())
    shim_dir = PROJECT_ROOT / ".local-bin"
    shim_dir.mkdir(parents=True, exist_ok=True)
    shim_path = shim_dir / "ffmpeg"
    if not shim_path.exists():
        shim_path.symlink_to(ffmpeg_source)
    os.environ["PATH"] = f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def main() -> int:
    args = build_parser().parse_args()
    rows = read_inventory(args.inventory)
    rows = rows[args.offset :]
    if args.limit is not None:
        rows = rows[: args.limit]

    failures = 0
    results = []
    for row in rows:
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            result = transcribe_one(
                row,
                audio_dir=args.audio_dir,
                transcripts_dir=args.transcripts_dir,
                segments_dir=args.segments_dir,
                model=args.model,
                language=args.language,
                force=args.force,
            )
            result["started_at"] = started_at
            result["finished_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:  # noqa: BLE001 - record per-link failures and continue.
            failures += 1
            result = {
                "source_id": row.get("source_id"),
                "status": "failed",
                "error": str(exc),
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        append_log(result)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False))

    summary = {
        "processed": len(rows),
        "transcribed_or_existing": sum(
            1 for item in results if item["status"] in {"transcribed", "skipped_existing"}
        ),
        "missing_audio": sum(1 for item in results if item["status"] == "missing_audio"),
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
