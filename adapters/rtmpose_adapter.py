#!/usr/bin/env python3
import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

import cv2


def main():
    request = json.load(sys.stdin)
    if request.get("health_check"):
        print(json.dumps(health_check(), ensure_ascii=False))
        return 0
    if request.get("metadata_check"):
        video_path = request.get("video_path")
        if not video_path or not Path(video_path).exists():
            print(json.dumps({"error": "video_path missing or not found"}))
            return 2
        print(json.dumps({
            "engine": "OpenCV",
            "status": "metadata_ready",
            "metadata": read_video_meta(video_path, request),
        }, ensure_ascii=False))
        return 0

    video_path = request.get("video_path")
    if not video_path or not Path(video_path).exists():
        print(json.dumps({"error": "video_path missing or not found"}))
        return 2

    video_meta = read_video_meta(video_path, request)

    try:
        from mmpose.apis import MMPoseInferencer
    except Exception as exc:
        print(json.dumps({
            "error": "mmpose is not installed or cannot be imported",
            "detail": str(exc)[:400],
        }))
        return 3

    model_name = os.environ.get("RTMPOSE_MODEL", "human")
    device = os.environ.get("RTMPOSE_DEVICE", "cpu")
    results = []
    confidences = []
    target_frames = target_frame_indexes(video_meta)
    with redirect_stdout(sys.stderr):
        inferencer = MMPoseInferencer(model_name, device=device)
        for index, frame in read_target_frames(video_path, target_frames):
            for result in inferencer(frame, show=False, return_vis=False):
                predictions = result.get("predictions") or []
                if predictions and predictions[0]:
                    person = best_person(predictions[0])
                    keypoints = person.get("keypoints") or []
                    scores = person.get("keypoint_scores") or []
                    confidences.extend(float(score) for score in scores if score is not None)
                    results.append({
                        "frame_index": index,
                        "time_ms": round((index / max(video_meta["fps"], 1)) * 1000),
                        "keypoints": keypoints,
                        "keypoint_scores": scores,
                    })
                break

    confidence = sum(confidences) / len(confidences) if confidences else 0
    print(json.dumps({
        "engine": "MMPoseInferencer",
        "model": model_name,
        "device": device,
        "confidence": round(confidence, 3),
        "image_width": video_meta["width"],
        "image_height": video_meta["height"],
        "fps": video_meta["fps"],
        "frame_count": video_meta["frame_count"],
        "sampled_frames": [row["frame_index"] for row in results],
        "sampling_policy": sampling_policy(video_meta),
        "pose_series": results,
    }, ensure_ascii=False))
    return 0


def health_check():
    checks = {
        "torch": module_status("torch"),
        "torchvision": module_status("torchvision"),
        "mmengine": module_status("mmengine"),
        "mmcv": module_status("mmcv"),
        "mmdet": module_status("mmdet"),
        "mmpose": module_status("mmpose"),
        "cv2": module_status("cv2"),
        "xtcocotools": module_status("xtcocotools"),
    }
    missing = [name for name, status in checks.items() if not status["available"]]
    return {
        "engine": "MMPose RTMPose",
        "ok": not missing,
        "status": "healthy" if not missing else "degraded",
        "model": os.environ.get("RTMPOSE_MODEL", "human"),
        "device": os.environ.get("RTMPOSE_DEVICE", "cpu"),
        "checks": checks,
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


def read_video_meta(video_path, request):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "width": 0,
            "height": 0,
            "fps": float(request.get("fps") or 60),
            "frame_count": 0,
            "duration_ms": 0,
            "source": "fallback",
        }
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or request.get("fps") or 60)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    return {
        "width": width,
        "height": height,
        "fps": fps,
        "frame_count": frame_count,
        "duration_ms": round((frame_count / max(fps, 1)) * 1000),
        "source": "opencv",
    }


def target_frame_indexes(video_meta):
    total = int(video_meta.get("frame_count") or 0)
    if total <= 0:
        return set(range(int(os.environ.get("RTMPOSE_MAX_FRAMES", "36"))))
    max_frames = max(1, int(os.environ.get("RTMPOSE_MAX_FRAMES", "36")))
    uniform_frames = max(1, int(os.environ.get("RTMPOSE_UNIFORM_FRAMES", "12")))
    mode = os.environ.get("RTMPOSE_FRAME_MODE", "auto").lower()
    if mode == "all" or (mode == "auto" and total <= max_frames):
        return set(range(total))
    count = min(total, uniform_frames)
    return set(sorted(int(i * (total - 1) / max(count - 1, 1)) for i in range(count)))


def sampling_policy(video_meta):
    total = int(video_meta.get("frame_count") or 0)
    max_frames = max(1, int(os.environ.get("RTMPOSE_MAX_FRAMES", "36")))
    mode = os.environ.get("RTMPOSE_FRAME_MODE", "auto").lower()
    if mode == "all" or (mode == "auto" and total <= max_frames):
        return "all_frames_short_video"
    return f"uniform_{int(os.environ.get('RTMPOSE_UNIFORM_FRAMES', '12'))}_frames"


def read_target_frames(video_path, target_frames):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return
    for index in sorted(target_frames):
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if ok:
            yield index, frame
    cap.release()


def best_person(people):
    def score(person):
        scores = [float(value) for value in person.get("keypoint_scores", []) if value is not None]
        if not scores:
            return 0
        visible = [value for value in scores if value >= 0.2]
        return (sum(scores) / len(scores)) + len(visible) * 0.01

    return max(people, key=score)


if __name__ == "__main__":
    raise SystemExit(main())
