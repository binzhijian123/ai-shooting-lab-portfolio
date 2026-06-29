#!/usr/bin/env python3
"""Synthesize cross-card shooting methodology documents from rule cards only."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from generate_cards_from_transcripts import call_deepseek, load_config


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARDS_DIR = PROJECT_ROOT / "outputs" / "cards"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "methodology"
DEFAULT_WORK_DIR = PROJECT_ROOT / "outputs" / "work"

OUTPUT_FILES = {
    "overall_methodology": "overall_methodology.md",
    "shooting_quality_rules": "shooting_quality_rules.md",
    "repair_playbook": "repair_playbook.md",
    "source_coverage": "source_coverage.md",
}

SECTION_NAMES = [
    "Topic",
    "App Module",
    "Applicable Scenarios",
    "Core Claims",
    "Step-by-Step Method",
    "Observable Movement Indicators",
    "Common Mistakes",
    "IF/THEN Diagnosis Rules",
    "Repair Actions / Practice Tasks",
    "False Positives",
    "Product / Agent Value",
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build methodology docs from outputs/cards/*.md.")
    parser.add_argument("--cards-dir", type=Path, default=DEFAULT_CARDS_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--max-section-chars", type=int, default=900)
    parser.add_argument("--max-batch-chars", type=int, default=22000)
    parser.add_argument("--dry-run", action="store_true", help="Report card readiness without calling DeepSeek.")
    return parser


def read_cards(cards_dir: Path) -> list[dict[str, object]]:
    paths = sorted(cards_dir.glob("*.md"))
    if not paths:
        raise SystemExit(f"No rule cards found in {cards_dir}. Generate cards before building methodology.")
    cards = [parse_card(path) for path in paths if path.is_file() and path.stat().st_size > 0]
    if not cards:
        raise SystemExit(f"No non-empty rule cards found in {cards_dir}.")
    return cards


def parse_card(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    source_id = find_comment(text, "source_id") or path.stem
    title_match = re.search(r"^#\s+Rule Card:\s*(.+)$", text, flags=re.MULTILINE)
    title = clean_inline(title_match.group(1)) if title_match else source_id
    sections = extract_sections(text)
    metadata = parse_bullets(sections.get("Source Metadata", ""))
    return {
        "id": source_id,
        "title": title,
        "source_url": metadata.get("URL", ""),
        "published_at": metadata.get("Published at", ""),
        "source_card_path": rel(path),
        "sections": sections,
    }


def find_comment(text: str, key: str) -> str | None:
    match = re.search(rf"<!--\s*{re.escape(key)}:\s*(.*?)\s*-->", text)
    return match.group(1).strip() if match else None


def extract_sections(text: str) -> dict[str, str]:
    matches = list(re.finditer(r"^##\s+(.+?)\s*$", text, flags=re.MULTILINE))
    sections: dict[str, str] = {}
    for index, match in enumerate(matches):
        name = clean_inline(match.group(1))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections[name] = text[start:end].strip()
    return sections


def parse_bullets(section: str) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for line in section.splitlines():
        match = re.match(r"^-\s*([^:：]+)[:：]\s*(.*)$", line.strip())
        if match:
            metadata[clean_inline(match.group(1))] = clean_inline(match.group(2))
    return metadata


def clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("**", "")).strip()


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def clip(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[: limit - 20].rstrip() + "\n...[clipped]"


def compact_cards(cards: list[dict[str, object]], max_section_chars: int) -> list[dict[str, object]]:
    compact: list[dict[str, object]] = []
    for card in cards:
        sections = card["sections"]
        assert isinstance(sections, dict)
        compact.append(
            {
                "id": card["id"],
                "title": card["title"],
                "source_url": card["source_url"],
                "published_at": card["published_at"],
                "source_card_path": card["source_card_path"],
                "sections": {
                    name: clip(str(sections.get(name, "")), max_section_chars)
                    for name in SECTION_NAMES
                    if str(sections.get(name, "")).strip()
                },
            }
        )
    return compact


def pack_batches(cards: list[dict[str, object]], max_batch_chars: int) -> list[list[dict[str, object]]]:
    batches: list[list[dict[str, object]]] = []
    current: list[dict[str, object]] = []
    current_len = 0
    for card in cards:
        size = len(json.dumps(card, ensure_ascii=False))
        if current and current_len + size > max_batch_chars:
            batches.append(current)
            current = []
            current_len = 0
        current.append(card)
        current_len += size
    if current:
        batches.append(current)
    return batches


def synthesis_system_prompt() -> str:
    return """你是篮球投篮训练方法论架构师。
只使用规则卡摘要，不读取、不还原、不复制原始转写稿。
输出必须是可执行的方法论、判断规则和训练修复框架，不要普通摘要。
硬性要求：
- 不要连续复制规则卡中的长句；用自己的简洁表达重写。
- 不要编造来源数量、source_id、URL、文件名；这些只能来自输入。
- 区分明确证据、跨卡共性和需要人工复核的推断。
- 面向投篮分析 APP：视频观察、错误分类、反馈生成、训练处方。
- 不要声称代表任何创作者或平台。
- 只输出 Markdown 文档正文；从二级标题开始，不要寒暄、确认语或元说明。
"""


def call_synthesis(task_name: str, task_prompt: str, cards: list[dict[str, object]], max_batch_chars: int) -> str:
    config = load_config()
    batches = pack_batches(cards, max_batch_chars)
    source_ids = [str(card["id"]) for card in cards]
    if len(batches) == 1:
        user_prompt = build_user_prompt(task_name, task_prompt, cards, len(cards), source_ids)
        return call_deepseek(
            [{"role": "system", "content": synthesis_system_prompt()}, {"role": "user", "content": user_prompt}],
            config,
        ).strip()

    batch_notes: list[str] = []
    for index, batch in enumerate(batches, start=1):
        prompt = build_user_prompt(
            f"{task_name} batch notes {index}/{len(batches)}",
            task_prompt + "\n先输出本批次的压缩中间结论，供最终合成使用。",
            batch,
            len(cards),
            source_ids,
        )
        batch_notes.append(
            call_deepseek(
                [{"role": "system", "content": synthesis_system_prompt()}, {"role": "user", "content": prompt}],
                config,
            ).strip()
        )

    final_prompt = f"""任务：{task_name}

{task_prompt}

全量 source_count: {len(cards)}
全量 source_ids: {", ".join(source_ids)}

下面是按批次压缩后的中间结论。请合成为最终 Markdown，不要添加输入外的新来源。

{json.dumps(batch_notes, ensure_ascii=False, indent=2)}
"""
    return call_deepseek(
        [{"role": "system", "content": synthesis_system_prompt()}, {"role": "user", "content": final_prompt}],
        config,
    ).strip()


def build_batch_notes(cards: list[dict[str, object]], max_batch_chars: int, work_dir: Path) -> list[str]:
    config = load_config()
    work_dir.mkdir(parents=True, exist_ok=True)
    notes_path = work_dir / "methodology_batch_notes.json"
    batches = pack_batches(cards, max_batch_chars)
    notes: list[str] = []
    if notes_path.exists():
        loaded = json.loads(notes_path.read_text(encoding="utf-8"))
        if loaded.get("source_count") == len(cards) and loaded.get("batch_count") == len(batches):
            notes = [str(item) for item in loaded.get("notes", [])]

    for index, batch in enumerate(batches[len(notes) :], start=len(notes) + 1):
        batch_ids = [str(card["id"]) for card in batch]
        prompt = f"""任务：global_methodology_batch_notes {index}/{len(batches)}

请把本批规则卡压缩为最终方法论可复用的中间结论。

必须覆盖：
- 投篮质量判断规则
- 动作观察信号
- 常见错误类型
- 修复动作和训练任务
- 证据强弱、误判边界、需要人工复核的点
- 对投篮分析 APP 有用的反馈模板思路

只允许引用本批 source_ids: {", ".join(batch_ids)}
总 source_count: {len(cards)}

规则卡摘要 JSON：
{json.dumps(batch, ensure_ascii=False, indent=2)}
"""
        note = call_deepseek(
            [{"role": "system", "content": synthesis_system_prompt()}, {"role": "user", "content": prompt}],
            config,
        ).strip()
        notes.append(note)
        notes_path.write_text(
            json.dumps(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "source_count": len(cards),
                    "batch_count": len(batches),
                    "notes": notes,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(json.dumps({"batch_note_ready": index, "batch_count": len(batches)}, ensure_ascii=False), flush=True)
    return notes


def call_synthesis_from_notes(task_name: str, task_prompt: str, cards: list[dict[str, object]], notes: list[str]) -> str:
    config = load_config()
    source_ids = [str(card["id"]) for card in cards]
    prompt = f"""任务：{task_name}

{task_prompt}

全量 source_count: {len(cards)}
全量 source_ids: {", ".join(source_ids)}

下面是从全量规则卡分批压缩得到的中间结论。请合成为最终 Markdown，不要添加输入外的新来源。

{json.dumps(notes, ensure_ascii=False, indent=2)}
"""
    return call_deepseek(
        [{"role": "system", "content": synthesis_system_prompt()}, {"role": "user", "content": prompt}],
        config,
    ).strip()


def build_user_prompt(
    task_name: str,
    task_prompt: str,
    cards: list[dict[str, object]],
    total_source_count: int,
    all_source_ids: Iterable[str],
) -> str:
    return f"""任务：{task_name}

{task_prompt}

总 source_count: {total_source_count}
允许引用的 source_ids: {", ".join(all_source_ids)}

规则卡摘要 JSON：
{json.dumps(cards, ensure_ascii=False, indent=2)}
"""


def document_header(title: str, cards: list[dict[str, object]]) -> str:
    generated_at = datetime.now(timezone.utc).isoformat()
    ids = ", ".join(str(card["id"]) for card in cards)
    return f"<!-- generated_at: {generated_at} -->\n<!-- source_count: {len(cards)} -->\n<!-- source_ids: {ids} -->\n\n# {title}\n\n"


def write_doc(output_dir: Path, filename: str, title: str, body: str, cards: list[dict[str, object]]) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / filename
    path.write_text(document_header(title, cards) + normalize_body(body) + "\n", encoding="utf-8")
    return path


def normalize_body(body: str) -> str:
    lines = body.strip().splitlines()
    while lines and lines[0].strip().startswith(("好的", "作为", "以下是", "根据")):
        lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    if lines and re.match(r"^#\s+", lines[0].strip()):
        lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    return "\n".join(lines).strip()


def build_source_coverage(cards: list[dict[str, object]]) -> str:
    required_sections = [
        "Topic",
        "App Module",
        "Core Claims",
        "IF/THEN Diagnosis Rules",
        "Repair Actions / Practice Tasks",
        "False Positives",
    ]
    lines = [
        "## Coverage Summary",
        "",
        f"- Source count: {len(cards)}",
        f"- Generated from: `outputs/cards/*.md`",
        "- Raw transcripts/audio/video: not used",
        "",
        "## Source Table",
        "",
        "| Source ID | Card | URL | Missing Key Sections |",
        "| --- | --- | --- | --- |",
    ]
    for card in cards:
        sections = card["sections"]
        assert isinstance(sections, dict)
        missing = [name for name in required_sections if not str(sections.get(name, "")).strip()]
        lines.append(
            "| {source_id} | `{path}` | {url} | {missing} |".format(
                source_id=card["id"],
                path=card["source_card_path"],
                url=card["source_url"] or "not_stated",
                missing=", ".join(missing) if missing else "none",
            )
        )
    lines.extend(
        [
            "",
            "## Interpretation Notes",
            "",
            "- Coverage is deterministic and based on card file structure only.",
            "- A source can be present but still weak if its card has many `not_stated` fields.",
            "- Claims that appear in only one source should be treated as source-specific until more cards support them.",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = build_parser().parse_args()
    cards = compact_cards(read_cards(args.cards_dir), args.max_section_chars)
    if args.dry_run:
        print(json.dumps({"cards_ready": len(cards), "output_dir": str(args.output_dir)}, ensure_ascii=False, indent=2))
        return 0

    notes = build_batch_notes(cards, args.max_batch_chars, args.work_dir)

    overall = call_synthesis_from_notes(
        "overall_methodology",
        """生成 `Overall Methodology` 文档。
必须包含：核心训练观、视频诊断流程、从观察到判断的步骤、证据等级、常见冲突/人工复核点、APP 反馈原则。
输出 Markdown，层级清晰，避免长引用。""",
        cards,
        notes,
    )
    quality_rules = call_synthesis_from_notes(
        "shooting_quality_rules",
        """生成 `Shooting Quality Rules` 文档。
必须包含：可观察信号 taxonomy、IF/THEN 判断规则、需要的机位/证据、误判边界、置信度标注方式。
每条规则都应能服务于视频动作分析。输出 Markdown。""",
        cards,
        notes,
    )
    repair_playbook = call_synthesis_from_notes(
        "repair_playbook",
        """生成 `Repair Playbook` 文档。
必须包含：错误类型 -> 修复目标 -> 训练动作 -> 剂量 -> 成功指标 -> 不适用条件。
训练建议要可执行，不要泛泛鼓励。输出 Markdown。""",
        cards,
        notes,
    )
    coverage = build_source_coverage(cards)

    written = [
        write_doc(args.output_dir, OUTPUT_FILES["overall_methodology"], "Overall Methodology", overall, cards),
        write_doc(args.output_dir, OUTPUT_FILES["shooting_quality_rules"], "Shooting Quality Rules", quality_rules, cards),
        write_doc(args.output_dir, OUTPUT_FILES["repair_playbook"], "Repair Playbook", repair_playbook, cards),
        write_doc(args.output_dir, OUTPUT_FILES["source_coverage"], "Source Coverage", coverage, cards),
    ]
    print(json.dumps({"written": [rel(path) for path in written], "source_count": len(cards)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
