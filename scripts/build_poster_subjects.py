from __future__ import annotations

import json
import argparse
from pathlib import Path

from PIL import Image, ImageOps
from rembg import new_session, remove


ROOT = Path(__file__).resolve().parents[1]
POSTER_DIR = ROOT / "app" / "assets" / "poster"
SUBJECT_DIR = POSTER_DIR / "subjects"
CENTERED_DIR = SUBJECT_DIR / "centered"
REPORT_PATH = SUBJECT_DIR / "build-summary.json"

POSTERS = [
    ("arclab-reference.jpeg", "arclab-reference-subject.png"),
    ("we-the-north.JPG", "we-the-north-subject.png"),
    ("curry-corner.JPG", "curry-corner-subject.png"),
    ("curry-boston.JPG", "curry-boston-subject.png"),
    ("george-contest.JPG", "george-contest-subject.png"),
    ("kobe-release.JPG", "kobe-release-subject.png"),
    ("jordan-release.jpg", "jordan-release-subject.png"),
    ("melo-release.JPG", "melo-release-subject.png"),
    ("kyrie-release.JPG", "kyrie-release-subject.png"),
    ("shai-alexander.JPG", "shai-alexander-subject.png"),
]


def build_session():
    try:
        return "u2net_human_seg", new_session("u2net_human_seg")
    except Exception:
        return "u2net", new_session("u2net")


def trim_alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    if image.mode != "RGBA":
        return None
    return image.getchannel("A").getbbox()


def process_one(source: Path, output: Path, centered_dir: Path, session) -> dict:
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw).convert("RGBA")
        cutout = remove(
            image,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=235,
            alpha_matting_background_threshold=12,
            alpha_matting_erode_size=8,
        )
        if not isinstance(cutout, Image.Image):
            cutout = Image.open(cutout).convert("RGBA")
        else:
            cutout = cutout.convert("RGBA")

    output.parent.mkdir(parents=True, exist_ok=True)
    cutout.save(output, "PNG", optimize=True)
    centered_output = centered_dir / output.name
    centered = crop_subject_for_centering(cutout)
    centered_output.parent.mkdir(parents=True, exist_ok=True)
    centered.save(centered_output, "PNG", optimize=True)
    bbox = trim_alpha_bbox(cutout)
    alpha_pixels = 0
    if bbox:
        alpha = cutout.getchannel("A")
        alpha_pixels = sum(1 for value in alpha.getdata() if value > 8)
    return {
        "source": project_path(source),
        "output": project_path(output),
        "centered_output": project_path(centered_output),
        "source_size": [cutout.width, cutout.height],
        "centered_size": [centered.width, centered.height],
        "alpha_bbox": list(bbox) if bbox else None,
        "alpha_pixel_ratio": round(alpha_pixels / (cutout.width * cutout.height), 4),
        "bytes": output.stat().st_size,
        "centered_bytes": centered_output.stat().st_size,
    }


def crop_subject_for_centering(image: Image.Image) -> Image.Image:
    bbox = trim_alpha_bbox(image)
    if not bbox:
        return image
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    pad_x = max(24, int(width * 0.18))
    pad_y = max(24, int(height * 0.14))
    crop = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(image.width, right + pad_x),
        min(image.height, bottom + pad_y),
    )
    return image.crop(crop)


def project_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(resolved)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build transparent poster subject assets.")
    parser.add_argument("--input-dir", type=Path, default=POSTER_DIR)
    parser.add_argument("--output-dir", type=Path, default=SUBJECT_DIR)
    parser.add_argument("--centered-dir", type=Path, default=CENTERED_DIR)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--glob", default=None)
    args = parser.parse_args()
    args.input_dir = args.input_dir.resolve()
    args.output_dir = args.output_dir.resolve()
    args.centered_dir = args.centered_dir.resolve()
    args.report = args.report.resolve()

    model_name, session = build_session()
    results = []
    if args.glob:
        posters = [(path.name, f"{path.stem}-subject.png") for path in sorted(args.input_dir.glob(args.glob))]
    else:
        posters = POSTERS

    for source_name, output_name in posters:
        source = args.input_dir / source_name
        output = args.output_dir / output_name
        print(f"segmenting {source.name} -> {output.name}")
        results.append(process_one(source, output, args.centered_dir, session))

    summary = {
        "schema_version": "poster_subject_build.v1",
        "model": model_name,
        "count": len(results),
        "results": results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
