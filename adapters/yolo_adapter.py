#!/usr/bin/env python3
import json
import math
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

import cv2
from ultralytics import YOLO


def main():
    request = json.load(sys.stdin)
    if request.get("health_check"):
        print(json.dumps(health_check(request), ensure_ascii=False))
        return 0

    video_path = request.get("video_path")
    if not video_path or not Path(video_path).exists():
        print(json.dumps({"error": "video_path missing or not found"}))
        return 2

    model_name = request.get("model") or os.environ.get("YOLO_MODEL") or "yolo11n.pt"
    with redirect_stdout(sys.stderr):
        model = YOLO(model_name)
        world_model = load_world_model(request)
    frames = sample_frames(video_path)
    best = {
        "ball": {"confidence": 0, "source": "ultralytics_yolo"},
        "person": {"confidence": 0, "source": "ultralytics_yolo"},
        "rim": {"confidence": 0, "source": "yolo_world_not_configured" if world_model is None else "ultralytics_yolo_world"},
    }
    ball_points = []
    rim_boxes = []

    for frame_index, frame in frames:
        with redirect_stdout(sys.stderr):
            results = model.predict(frame, verbose=False, imgsz=640)
        for result in results:
            names = result.names
            for box in result.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                name = names.get(cls, str(cls))
                xyxy = [float(v) for v in box.xyxy[0].tolist()]
                if name == "sports ball" and conf > best["ball"]["confidence"]:
                    best["ball"] = {"confidence": round(conf, 3), "source": "ultralytics_yolo", "frame": frame_index, "box": xyxy}
                if name == "sports ball":
                    ball_points.append(point_from_box(frame_index, xyxy, conf))
                if name == "person" and conf > best["person"]["confidence"]:
                    best["person"] = {"confidence": round(conf, 3), "source": "ultralytics_yolo", "frame": frame_index, "box": xyxy}
        if world_model is not None:
            detect_rim_with_world(world_model, frame, frame_index, best, rim_boxes)

    shot_summary = estimate_shot_events(ball_points, rim_boxes, frames)

    print(json.dumps({
        "models": {
            "coco": model_name,
            "rim": request.get("world_model") or os.environ.get("YOLO_WORLD_MODEL") or None,
        },
        "detections": best,
        "ball_path_offset_cm": shot_summary["ball_path_offset_cm"] if shot_summary["ball_path_offset_cm"] is not None else estimate_offset(ball_points),
        "shot_events": shot_summary["events"],
        "shot_summary": shot_summary["summary"],
        "trajectory": {
            "ball_points": compact_points(ball_points),
            "rim_reference": compact_box(best["rim"].get("box")) if isinstance(best.get("rim"), dict) else None,
        },
        "inspired_by": {
            "project": "chonyy/AI-basketball-analysis",
            "adapted_signals": ["ball_over_rim_height", "make_miss_by_rim_x_range", "early_ball_path_release_angle"],
            "note": "Reimplemented as YOLO adapter heuristics; OpenPose/TensorFlow runtime is not embedded."
        },
        "sampled_frames": [frame_index for frame_index, _ in frames],
    }, ensure_ascii=False))
    return 0


def health_check(request):
    checks = {
        "ultralytics": module_status("ultralytics"),
        "torch": module_status("torch"),
        "cv2": module_status("cv2"),
        "clip": module_status("clip"),
    }
    model_name = request.get("model") or os.environ.get("YOLO_MODEL") or "yolo11n.pt"
    world_model = request.get("world_model") or os.environ.get("YOLO_WORLD_MODEL") or ""
    weights = {
        "coco": weight_status(model_name),
        "world": weight_status(world_model) if world_model else {"configured": False, "exists": False},
    }
    missing = [
        name for name, status in checks.items()
        if name != "clip" and not status["available"]
    ]
    if world_model and not checks["clip"]["available"]:
        missing.append("clip")
    return {
        "engine": "Ultralytics YOLO + YOLO-World",
        "ok": not missing,
        "status": "healthy" if not missing else "degraded",
        "checks": checks,
        "weights": weights,
        "missing": missing,
    }


def module_status(name):
    try:
        module = __import__(name)
        return {
            "available": True,
            "version": getattr(module, "__version__", "ok"),
        }
    except Exception as exc:
        return {
            "available": False,
            "error": str(exc)[:240],
        }


def weight_status(name):
    if not name:
        return {"configured": False, "exists": False}
    return {
        "configured": True,
        "name": name,
        "exists": Path(name).exists(),
        "source": "local_file" if Path(name).exists() else "download_on_first_run",
    }


def load_world_model(request):
    model_name = request.get("world_model") or os.environ.get("YOLO_WORLD_MODEL")
    if not model_name:
        return None
    try:
        from ultralytics import YOLOWorld
        model = YOLOWorld(model_name)
        model.set_classes(["basketball hoop", "basketball rim", "backboard"])
        return model
    except Exception as exc:
        return {"error": str(exc)[:300]}


def detect_rim_with_world(world_model, frame, frame_index, best, rim_boxes):
    if isinstance(world_model, dict):
        best["rim"] = {
            "confidence": 0,
            "source": "yolo_world_error",
            "error": world_model["error"],
        }
        return
    with redirect_stdout(sys.stderr):
        results = world_model.predict(frame, verbose=False, imgsz=640)
    for result in results:
        names = result.names
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf <= best["rim"]["confidence"]:
                continue
            cls = int(box.cls[0])
            name = names.get(cls, str(cls))
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            best["rim"] = {
                "confidence": round(conf, 3),
                "source": "ultralytics_yolo_world",
                "label": name,
                "frame": frame_index,
                "box": xyxy,
            }
            rim_boxes.append({"frame": frame_index, "confidence": conf, "box": xyxy, "label": name})


def sample_frames(video_path, count=None):
    if count is None:
        count = int(os.environ.get("YOLO_SAMPLE_FRAMES", "16"))
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {video_path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        total = count
    indexes = sorted(set(int((i + 1) * total / (count + 1)) for i in range(count)))
    frames = []
    for index in indexes:
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if ok:
            frames.append((index, frame))
    cap.release()
    return frames


def point_from_box(frame_index, xyxy, confidence):
    return {
        "frame": frame_index,
        "x": (xyxy[0] + xyxy[2]) / 2,
        "y": (xyxy[1] + xyxy[3]) / 2,
        "box": xyxy,
        "confidence": confidence,
    }


def estimate_shot_events(ball_points, rim_boxes, frames):
    rim = best_rim(rim_boxes)
    if rim is None or len(ball_points) < 2:
        return {
            "summary": {
                "status": "insufficient_evidence",
                "attempts": 0,
                "made": 0,
                "missed": 0,
                "confidence": 0,
                "reason": "requires at least two ball detections and one rim detection",
            },
            "events": [],
            "ball_path_offset_cm": None,
        }

    points = sorted(ball_points, key=lambda item: item["frame"])
    rim_left, rim_top, rim_right, rim_bottom = rim["box"]
    rim_width = max(1, rim_right - rim_left)
    rim_center_x = (rim_left + rim_right) / 2
    rim_reference_y = rim_top + (rim_bottom - rim_top) * 0.35
    tolerance = rim_width * 0.35
    events = []
    active = []

    for point in points:
        above_rim = point["y"] < rim_reference_y
        near_rim_lane = rim_left - rim_width * 1.5 <= point["x"] <= rim_right + rim_width * 1.5
        if above_rim and near_rim_lane:
            active.append(point)
            continue
        if active and point["y"] >= rim_reference_y:
            path = [*active, point]
            judgement = "made" if rim_left - tolerance <= point["x"] <= rim_right + tolerance else "missed"
            release_angle = release_angle_deg(path)
            confidence = event_confidence(path, rim)
            events.append({
                "event_id": f"shot_{len(events) + 1}",
                "judgement": judgement,
                "confidence": confidence,
                "start_frame": path[0]["frame"],
                "release_frame": path[min(1, len(path) - 1)]["frame"],
                "rim_cross_frame": point["frame"],
                "release_angle_deg": release_angle,
                "ball_path_offset_cm": path_offset_cm(path, rim_center_x, rim_width),
                "basis": "ball rose above rim reference then returned through rim horizontal range",
            })
            active = []

    if not events and len(points) >= 2:
        path = points
        closest = min(path, key=lambda item: abs(item["x"] - rim_center_x) + abs(item["y"] - rim_reference_y))
        judgement = "undetermined"
        events.append({
            "event_id": "shot_candidate_1",
            "judgement": judgement,
            "confidence": round(min(event_confidence(path, rim), 0.45), 3),
            "start_frame": path[0]["frame"],
            "release_frame": path[min(1, len(path) - 1)]["frame"],
            "rim_cross_frame": closest["frame"],
            "release_angle_deg": release_angle_deg(path),
            "ball_path_offset_cm": path_offset_cm(path, rim_center_x, rim_width),
            "basis": "ball and rim detected, but full above-rim crossing was not observed",
        })

    made = sum(1 for event in events if event["judgement"] == "made")
    missed = sum(1 for event in events if event["judgement"] == "missed")
    attempts = made + missed
    primary_offset = next((event["ball_path_offset_cm"] for event in events if event["ball_path_offset_cm"] is not None), None)
    return {
        "summary": {
            "status": "provided_by_yolo_heuristics",
            "attempts": attempts,
            "made": made,
            "missed": missed,
            "candidates": len(events),
            "confidence": round(max((event["confidence"] for event in events), default=0), 3),
            "rim_frame": rim["frame"],
            "sample_count": len(frames),
        },
        "events": events,
        "ball_path_offset_cm": primary_offset,
    }


def best_rim(rim_boxes):
    if not rim_boxes:
        return None
    return max(rim_boxes, key=lambda item: item.get("confidence", 0))


def release_angle_deg(points):
    if len(points) < 2:
        return None
    first = points[0]
    second = points[1]
    dx = max(1e-6, abs(second["x"] - first["x"]))
    dy = max(0, first["y"] - second["y"])
    return round(min(90, max(0, math.degrees(math.atan2(dy, dx)))), 1)


def path_offset_cm(points, rim_center_x, rim_width):
    if not points:
        return None
    release = points[min(1, len(points) - 1)]
    # Basketball rim inner diameter is about 45 cm; use rim pixel width as local scale.
    return round(((release["x"] - rim_center_x) / max(1, rim_width)) * 45, 1)


def event_confidence(points, rim):
    point_conf = sum(point["confidence"] for point in points) / max(1, len(points))
    return round(min(point_conf, rim.get("confidence", 0)), 3)


def estimate_offset(ball_points):
    if len(ball_points) < 2:
        return None
    xs = [point["x"] for point in ball_points]
    return round((max(xs) - min(xs)) / 12, 1)


def compact_points(points):
    return [
        {
            "frame": int(point["frame"]),
            "x": round(point["x"], 1),
            "y": round(point["y"], 1),
            "confidence": round(point["confidence"], 3),
        }
        for point in points[:32]
    ]


def compact_box(box):
    if not isinstance(box, list) or len(box) != 4:
        return None
    return [round(float(value), 1) for value in box]


if __name__ == "__main__":
    raise SystemExit(main())
