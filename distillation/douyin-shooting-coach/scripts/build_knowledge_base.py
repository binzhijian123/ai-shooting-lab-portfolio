#!/usr/bin/env python3
"""Build outputs/knowledge_base.json from distilled shooting rule cards."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARDS_DIR = PROJECT_ROOT / "outputs" / "cards"
DEFAULT_OUTPUT = PROJECT_ROOT / "outputs" / "knowledge_base.json"
DEFAULT_SCHEMA = PROJECT_ROOT / "schemas" / "knowledge_base.schema.json"
DEFAULT_SIGNAL_REGISTRY = PROJECT_ROOT / "inputs" / "research_signal_registry.json"
VALID_APP_MODULES = {"pose_analysis", "shot_diagnosis", "training_repair", "progress_review"}
MOTION_KEYS = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle/foot", "ball path", "timing"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build knowledge_base.json from outputs/cards/*.md.")
    parser.add_argument("--cards-dir", type=Path, default=DEFAULT_CARDS_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--signal-registry", type=Path, default=DEFAULT_SIGNAL_REGISTRY)
    parser.add_argument("--dry-run", action="store_true", help="Validate card parsing without writing JSON.")
    return parser


def read_cards(cards_dir: Path) -> list[dict[str, Any]]:
    paths = sorted(cards_dir.glob("*.md"))
    if not paths:
        raise SystemExit(f"No rule cards found in {cards_dir}. Generate cards before building knowledge_base.json.")
    cards = [parse_card(path) for path in paths if path.is_file() and path.stat().st_size > 0]
    if not cards:
        raise SystemExit(f"No non-empty rule cards found in {cards_dir}.")
    return cards


def parse_card(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    source_id = find_comment(text, "source_id") or path.stem
    title_match = re.search(r"^#\s+Rule Card:\s*(.+)$", text, flags=re.MULTILINE)
    title = clean_inline(title_match.group(1)) if title_match else source_id
    sections = extract_sections(text)
    metadata = parse_key_value_bullets(sections.get("Source Metadata", ""))
    app_modules = parse_app_modules(sections.get("App Module", ""))
    observable_signals = parse_observable_signals(sections.get("Observable Movement Indicators", ""))
    use_cases = parse_applicable_scenarios(sections.get("Applicable Scenarios", ""))
    motion_focus = infer_motion_focus(observable_signals, sections)
    return {
        "id": source_id,
        "title": title,
        "source_url": metadata.get("URL", ""),
        "source_type": metadata.get("Platform", "douyin") or "douyin",
        "tags": infer_tags(title, app_modules, motion_focus, sections),
        "app_modules": app_modules,
        "summary": compact_text(sections.get("Topic", ""), 260) or "not_stated",
        "motion_focus": motion_focus,
        "observable_signals": observable_signals,
        "use_cases": use_cases,
        "core_rules": parse_core_rules(sections.get("Core Claims", "")),
        "diagnosis_rules": parse_diagnosis_rules(sections.get("IF/THEN Diagnosis Rules", "")),
        "repair_actions": parse_repair_actions(sections.get("Repair Actions / Practice Tasks", "")),
        "false_positives": parse_false_positives(sections.get("False Positives", "")),
        "source_card_path": rel(path),
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


def parse_key_value_bullets(section: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in section.splitlines():
        match = re.match(r"^-\s*([^:：]+)[:：]\s*(.*)$", line.strip())
        if match:
            result[clean_inline(match.group(1))] = clean_inline(match.group(2))
    return result


def parse_app_modules(section: str) -> list[str]:
    modules = [module for module in VALID_APP_MODULES if module in section]
    return sorted(modules) if modules else ["shot_diagnosis"]


def parse_applicable_scenarios(section: str) -> list[str]:
    values: list[str] = []
    for line in section.splitlines():
        match = re.match(r"^-\s*([^:：]+)[:：]\s*(.*)$", line.strip())
        if match and clean_inline(match.group(2)) and "not_stated" not in match.group(2):
            values.append(f"{clean_inline(match.group(1))}: {compact_text(match.group(2), 160)}")
    return values or ["not_stated"]


def parse_observable_signals(section: str) -> list[str]:
    signals: list[str] = []
    for line in section.splitlines():
        match = re.match(r"^-\s*(?:\*\*)?([^:*：]+)(?:\*\*)?[:：]\s*(.*)$", line.strip())
        if not match:
            continue
        key = clean_inline(match.group(1)).lower()
        value = clean_inline(match.group(2))
        if value and value != "not_stated":
            signals.append(f"{key}: {compact_text(value, 180)}")
    return signals or ["not_stated"]


def infer_motion_focus(observable_signals: list[str], sections: dict[str, str]) -> list[str]:
    focus = []
    signal_text = "\n".join(observable_signals).lower()
    all_text = "\n".join(sections.values()).lower()
    for key in MOTION_KEYS:
        if key in signal_text or key in all_text:
            focus.append(key)
    return focus or ["general_shooting_form"]


def infer_tags(title: str, app_modules: list[str], motion_focus: list[str], sections: dict[str, str]) -> list[str]:
    text = f"{title}\n" + "\n".join(sections.values())
    tags = set(app_modules + motion_focus)
    keyword_map = {
        "主视眼": "dominant_eye",
        "起球": "ball_pickup",
        "旋转": "rotation",
        "下肢": "lower_body_power",
        "急停": "pull_up_stop",
        "投篮": "shooting",
        "发力": "power_chain",
    }
    for keyword, tag in keyword_map.items():
        if keyword in text:
            tags.add(tag)
    return sorted(tag for tag in tags if tag)


def parse_core_rules(section: str) -> list[str]:
    rules: list[str] = []
    current: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if re.match(r"^\d+\.\s+", stripped):
            if current:
                rules.append(compact_text(" ".join(current), 240))
            current = [re.sub(r"^\d+\.\s+", "", stripped)]
        elif current and stripped and not stripped.startswith("- evidence"):
            current.append(stripped)
    if current:
        rules.append(compact_text(" ".join(current), 240))
    return [clean_inline(rule) for rule in rules if rule] or ["not_stated"]


def parse_diagnosis_rules(section: str) -> list[dict[str, str]]:
    blocks = re.split(r"\n(?=-\s*(?:\*\*)?IF(?:\*\*)?[:：])", "\n" + section.strip())
    rules: list[dict[str, str]] = []
    for block in blocks:
        if "IF" not in block or "THEN" not in block:
            continue
        rule = {
            "if": extract_labeled_value(block, "IF"),
            "then": extract_labeled_value(block, "THEN"),
            "check": extract_labeled_value(block, "CHECK"),
            "repair": extract_labeled_value(block, "REPAIR"),
            "confidence_basis": extract_labeled_value(block, "confidence_basis"),
        }
        if rule["if"] and rule["then"]:
            rules.append({key: compact_text(value or "not_stated", 220) for key, value in rule.items()})
    return rules or [
        {
            "if": "not_stated",
            "then": "not_stated",
            "check": "not_stated",
            "repair": "not_stated",
            "confidence_basis": "not_stated",
        }
    ]


def extract_labeled_value(block: str, label: str) -> str:
    labels = ["IF", "THEN", "CHECK", "REPAIR", "confidence_basis"]
    alternatives = "|".join(re.escape(item) for item in labels)
    pattern = rf"(?:^|\n)\s*-?\s*(?:\*\*)?{re.escape(label)}(?:\*\*)?[:：]\s*(.*?)(?=\n\s*-?\s*(?:\*\*)?(?:{alternatives})(?:\*\*)?[:：]|\Z)"
    match = re.search(pattern, block, flags=re.DOTALL)
    return clean_inline(match.group(1)) if match else ""


def parse_repair_actions(section: str) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    parts = re.split(r"\n(?=\d+\.\s*(?:\*\*)?Drill[:：])", "\n" + section.strip())
    for part in parts:
        drill_match = re.search(r"\d+\.\s*(?:\*\*)?Drill[:：]\s*(.*?)(?:\*\*)?\s*(?:\n|$)", part)
        if not drill_match:
            continue
        fields = parse_key_value_bullets(part)
        purpose = fields.get("purpose", fields.get("Purpose", "not_stated"))
        actions.append(
            {
                "drill": compact_text(drill_match.group(1), 120),
                "dosage": compact_text(fields.get("dosage", fields.get("Dosage", "not_stated")), 120),
                "cue": compact_text(purpose, 160),
                "success_metric": compact_text(fields.get("success_metric", fields.get("Success metric", "not_stated")), 160),
            }
        )
    return actions or [{"drill": "not_stated", "dosage": "not_stated", "cue": "not_stated", "success_metric": "not_stated"}]


def parse_false_positives(section: str) -> list[str]:
    items: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if stripped.startswith("-"):
            items.append(compact_text(stripped.lstrip("- ").replace("**", ""), 220))
    return items or ["not_stated"]


def compact_text(value: str, limit: int) -> str:
    value = clean_inline(value)
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("**", "")).strip()


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def read_signal_registry(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "version": "0.0.0",
            "source": "not_configured",
            "policy": {
                "diagnostic_use": "No signal registry configured.",
                "threshold_types": {},
            },
            "signals": [],
        }
    registry = json.loads(path.read_text(encoding="utf-8"))
    validate_signal_registry(registry, path)
    return registry


def validate_signal_registry(registry: dict[str, Any], path: Path) -> None:
    required_root = {"version", "source", "policy", "signals"}
    missing_root = sorted(required_root - set(registry))
    if missing_root:
        raise SystemExit(f"{path}: missing required keys: {', '.join(missing_root)}")
    if not isinstance(registry["signals"], list):
        raise SystemExit(f"{path}: signals must be an array")
    required_signal = {
        "signal_id",
        "name",
        "category",
        "required_view",
        "required_metrics",
        "soft_thresholds",
        "must_combine_with",
        "not_a_diagnosis_by_itself",
        "diagnostic_use",
        "false_positive_checks",
        "research_basis",
        "linked_knowledge_tags",
    }
    seen: set[str] = set()
    for index, signal in enumerate(registry["signals"]):
        if not isinstance(signal, dict):
            raise SystemExit(f"{path}: signals[{index}] must be an object")
        missing_signal = sorted(required_signal - set(signal))
        if missing_signal:
            raise SystemExit(f"{path}: signals[{index}] missing required keys: {', '.join(missing_signal)}")
        signal_id = signal["signal_id"]
        if signal_id in seen:
            raise SystemExit(f"{path}: duplicate signal_id {signal_id!r}")
        seen.add(signal_id)
        if not signal["research_basis"]:
            raise SystemExit(f"{path}: {signal_id} must include at least one research_basis entry")


def build_knowledge_base(cards: list[dict[str, Any]], signal_registry: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    return {
        "domain": "basketball_shooting_video_analysis",
        "creator": "douyin_shooting_coach_distillation",
        "version": "0.1.0",
        "generated_at": generated_at,
        "source_count": len(cards),
        "cards": cards,
        "methodology": {
            "documents": {
                "overall_methodology": "outputs/methodology/overall_methodology.md",
                "shooting_quality_rules": "outputs/methodology/shooting_quality_rules.md",
                "repair_playbook": "outputs/methodology/repair_playbook.md",
                "source_coverage": "outputs/methodology/source_coverage.md",
            },
            "source": "Derived from distilled rule cards only.",
        },
        "taxonomy": build_taxonomy(cards),
        "signal_registry": signal_registry,
        "agent_rules": {
            "input_boundary": "Use distilled cards and methodology outputs; do not require raw transcripts/audio/video at answer time.",
            "evidence_policy": "Separate explicit card evidence from inference; use research-backed signals as candidate evidence, not standalone diagnoses; ask for missing camera angles when evidence is insufficient.",
            "feedback_policy": "Return one diagnosis, one confidence basis, and one repair action before expanding into a full plan.",
            "privacy_policy": "Do not include API keys, raw media, or long verbatim source text in outputs.",
        },
        "smoke_tests": [
            {
                "case": "User reports unstable pull-up jumper and forward drift.",
                "expected_behavior": "Ask for front/side video if missing, classify observable drift/rotation evidence, then give one repair drill with success metric.",
            }
        ],
    }


def build_taxonomy(cards: list[dict[str, Any]]) -> dict[str, Any]:
    modules = sorted({module for card in cards for module in card["app_modules"]})
    motion_focus = sorted({focus for card in cards for focus in card["motion_focus"]})
    rule_count = sum(len(card["diagnosis_rules"]) for card in cards)
    repair_count = sum(len(card["repair_actions"]) for card in cards)
    return {
        "app_modules": modules,
        "motion_focus": motion_focus,
        "diagnosis_rule_count": rule_count,
        "repair_action_count": repair_count,
        "source_specific_tags": sorted({tag for card in cards for tag in card["tags"]}),
    }


def validate_schema(instance: Any, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def check(value: Any, subschema: dict[str, Any], path: str) -> None:
        expected_type = subschema.get("type")
        if expected_type and not matches_type(value, expected_type):
            errors.append(f"{path}: expected {expected_type}, got {type(value).__name__}")
            return
        if "minimum" in subschema and isinstance(value, (int, float)) and value < subschema["minimum"]:
            errors.append(f"{path}: below minimum {subschema['minimum']}")
        if "enum" in subschema and value not in subschema["enum"]:
            errors.append(f"{path}: value {value!r} not in enum")
        if isinstance(value, dict):
            for key in subschema.get("required", []):
                if key not in value:
                    errors.append(f"{path}.{key}: missing required key")
            properties = subschema.get("properties", {})
            for key, item in value.items():
                if key in properties:
                    check(item, properties[key], f"{path}.{key}")
        if isinstance(value, list) and "items" in subschema:
            for index, item in enumerate(value):
                check(item, subschema["items"], f"{path}[{index}]")

    check(instance, schema, "$")
    return errors


def matches_type(value: Any, expected_type: str) -> bool:
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    return True


def main() -> int:
    args = build_parser().parse_args()
    cards = read_cards(args.cards_dir)
    signal_registry = read_signal_registry(args.signal_registry)
    knowledge_base = build_knowledge_base(cards, signal_registry)
    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    errors = validate_schema(knowledge_base, schema)
    if errors:
        raise SystemExit("knowledge_base schema validation failed:\n" + "\n".join(errors))
    if args.dry_run:
        print(json.dumps({"cards_ready": len(cards), "schema_valid": True}, ensure_ascii=False, indent=2))
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(knowledge_base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"written": rel(args.output), "source_count": len(cards), "schema_valid": True}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
