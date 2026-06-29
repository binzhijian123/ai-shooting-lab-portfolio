#!/usr/bin/env python3
"""Generate shooting rule cards from existing local transcripts.

This script intentionally does not download from Douyin. It only processes transcript
files that already exist in outputs/transcripts and are referenced by the inventory.
"""

from __future__ import annotations

import argparse
import csv
import http.client
import json
import os
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INVENTORY = PROJECT_ROOT / "inputs" / "source_inventory_2020_plus.csv"
DEFAULT_CARDS_DIR = PROJECT_ROOT / "outputs" / "cards"
DEFAULT_LOG = PROJECT_ROOT / "outputs" / "logs" / "card_generation.jsonl"
DEFAULT_PROMPT = PROJECT_ROOT / "prompts" / "shooting_rule_card_prompt.md"
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_MAX_CHARS_PER_CHUNK = 12000
ENV_PATHS = [
    PROJECT_ROOT / ".env",
    PROJECT_ROOT.parent.parent / ".env",
]


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str
    model: str
    temperature: float
    max_chars_per_chunk: int


SYSTEM_PROMPT = """你是篮球投篮动作方法论整理助手。
你的任务是把单条视频文案转成“投篮分析 APP 可用的规则卡”，不是普通摘要。
硬性要求：
- 只基于转写稿和库存元数据，不编造视频没有讲的动作细节。
- 不保留长段原文，不模仿博主口吻，不声称代表博主。
- 先读完整文案，再提取可迁移规则。
- 把明确证据与推断分开；推断必须标注 confidence。
- 输出要服务于动作视频诊断、错误分类、修正训练和 APP 反馈。
- 缺证据的字段写 not_stated。
"""


CARD_TEMPLATE = """请基于下面的视频文案生成单视频规则卡。

库存元数据：
- source_id: {source_id}
- source_url: {source_url}
- title: {title}
- published_at: {published_at}
- transcript_path: {transcript_path}

输出必须使用 Markdown，并包含：

# Rule Card: {title}

## Source Metadata
- Source ID:
- Creator:
- Platform:
- URL:
- Published at:
- Processed at:
- Transcript path:
- Copyright/source note:

## Topic
一句话说明这个视频解决的投篮问题。

## App Module
从这些模块中选择：pose_analysis, shot_diagnosis, training_repair, progress_review。

## Applicable Scenarios
- User scenario:
- Shot type:
- Camera angle needed:
- Skill level:

## Core Claims
列出 3-7 条；每条标注 evidence: explicit / inferred / not_stated。

## Step-by-Step Method
拆成动作步骤。每一步包含：动作、观察点、APP 检查点。

## Observable Movement Indicators
分别写 shoulder, elbow, wrist, hip, knee, ankle/foot, ball path, timing；没有证据写 not_stated。

## Hidden Assumptions
列出视频默认但未必总成立的前提。

## Common Mistakes
每个错误包含：symptom, likely_cause, evidence_needed。

## IF/THEN Diagnosis Rules
必须使用：
- IF:
  THEN:
  CHECK:
  REPAIR:
  confidence_basis:

## Repair Actions / Practice Tasks
每个训练包含：drill, purpose, setup, dosage, success_metric。

## False Positives
哪些画面现象容易误判，或哪些情况下不该套用该规则。

## Product / Agent Value
- How this rule helps video analysis:
- How this rule helps user feedback:
- What should not be inferred:

## Source Evidence Summary
只写短摘要，不复制长段文案。

视频文案：
{transcript}
"""


CHUNK_TEMPLATE = """先从这个长文案片段中抽取投篮方法论要点。
只输出结构化 Markdown，包含：
- explicit claims
- inferred claims with confidence
- movement indicators
- diagnosis rules
- repair drills
- unsupported / not_stated items

source_id: {source_id}
chunk: {chunk_index}/{chunk_count}

文案片段：
{chunk}
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Douyin shooting rule cards from local transcripts.")
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--cards-dir", type=Path, default=DEFAULT_CARDS_DIR)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Only report transcript/card readiness.")
    return parser


def load_config() -> LLMConfig:
    load_env_files()
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Missing DEEPSEEK_API_KEY. Set it locally before generating cards.")
    return LLMConfig(
        api_key=api_key,
        base_url=os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        model=os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL),
        temperature=float(os.environ.get("DEEPSEEK_TEMPERATURE", "0.2")),
        max_chars_per_chunk=int(os.environ.get("MAX_CHARS_PER_CHUNK", str(DEFAULT_MAX_CHARS_PER_CHUNK))),
    )


def load_env_files() -> None:
    for path in ENV_PATHS:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def read_inventory(path: Path) -> list[dict[str, str]]:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    if not rows:
        raise SystemExit(f"No inventory rows found: {path}")
    return rows


def transcript_path(row: dict[str, str]) -> Path:
    raw = Path(row["transcript_path"])
    return raw if raw.is_absolute() else PROJECT_ROOT / raw


def card_path(cards_dir: Path, row: dict[str, str]) -> Path:
    return cards_dir / f"{row['source_id']}.md"


def chunk_text(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for line in text.splitlines():
        line = line.rstrip()
        line_len = len(line) + 1
        if current and current_len + line_len > max_chars:
            chunks.append("\n".join(current).strip())
            current = []
            current_len = 0
        if line_len > max_chars:
            for start in range(0, len(line), max_chars):
                segment = line[start : start + max_chars].strip()
                if segment:
                    chunks.append(segment)
            continue
        current.append(line)
        current_len += line_len
    if current:
        chunks.append("\n".join(current).strip())
    return [chunk for chunk in chunks if chunk]


def call_deepseek(messages: list[dict[str, str]], config: LLMConfig, retries: int = 5) -> str:
    payload = json.dumps(
        {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{config.base_url}/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except (
            TimeoutError,
            socket.timeout,
            http.client.HTTPException,
            urllib.error.URLError,
            KeyError,
            IndexError,
            json.JSONDecodeError,
        ) as exc:
            if attempt >= retries:
                raise RuntimeError(f"DeepSeek call failed: {exc}") from exc
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("DeepSeek call failed")


def generate_card(row: dict[str, str], transcript: str, config: LLMConfig) -> str:
    chunks = chunk_text(transcript, config.max_chars_per_chunk)
    if not chunks:
        raise RuntimeError(f"Empty transcript: {row['source_id']}")
    if len(chunks) > 1:
        notes = []
        for index, chunk in enumerate(chunks, start=1):
            notes.append(
                call_deepseek(
                    [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": CHUNK_TEMPLATE.format(
                                source_id=row["source_id"],
                                chunk_index=index,
                                chunk_count=len(chunks),
                                chunk=chunk,
                            ),
                        },
                    ],
                    config,
                )
            )
        transcript = "\n\n".join(notes)

    return call_deepseek(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": CARD_TEMPLATE.format(
                    source_id=row["source_id"],
                    source_url=row["source_url"],
                    title=row["title"],
                    published_at=row["published_at"],
                    transcript_path=row["transcript_path"],
                    transcript=transcript,
                ),
            },
        ],
        config,
    )


def append_log(payload: dict[str, object]) -> None:
    DEFAULT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with DEFAULT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def main() -> int:
    args = build_parser().parse_args()
    rows = read_inventory(args.inventory)
    if args.limit is not None:
        rows = rows[: args.limit]

    ready = [row for row in rows if transcript_path(row).exists() and transcript_path(row).stat().st_size > 0]
    missing = [row for row in rows if row not in ready]
    summary = {
        "inventory_rows": len(rows),
        "ready_transcripts": len(ready),
        "missing_transcripts": len(missing),
        "cards_existing": sum(1 for row in rows if card_path(args.cards_dir, row).exists()),
    }
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if ready else 1

    if not ready:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        raise SystemExit("No transcript files are ready for card generation.")

    config = load_config()
    args.cards_dir.mkdir(parents=True, exist_ok=True)
    generated = 0
    skipped = 0
    for row in ready:
        output_path = card_path(args.cards_dir, row)
        if output_path.exists() and not args.force:
            skipped += 1
            continue
        source_path = transcript_path(row)
        transcript = source_path.read_text(encoding="utf-8")
        card = generate_card(row, transcript, config)
        header = (
            f"<!-- generated_at: {datetime.now(timezone.utc).isoformat()} -->\n"
            f"<!-- source_id: {row['source_id']} -->\n"
            f"<!-- transcript_path: {row['transcript_path']} -->\n\n"
        )
        output_path.write_text(header + card.strip() + "\n", encoding="utf-8")
        append_log({"source_id": row["source_id"], "status": "card_generated", "card": str(output_path)})
        generated += 1

    print(json.dumps({**summary, "generated": generated, "skipped": skipped}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
