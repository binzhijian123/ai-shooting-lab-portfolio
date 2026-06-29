# Ball Trajectory Spec

Updated: 2026-06-14

## 定位

球轨迹必须作为独立模块建设，而不是附属于 YOLO adapter 的临时字段。当前 YOLO adapter 只能提供作品集演示级启发式：通用 COCO `sports ball`、可选 YOLO-World `rim/backboard`、抽帧 ball points、候选 shot events 和低置信命中/未中摘要。

不得把当前 YOLO 启发式写成稳定 2D 球轨迹能力。

## 模块边界

模块名：`ball_trajectory.v1`

输入：

```json
{
  "video_id": "upload_...",
  "camera_view": "side_back|side|front",
  "fps": 60,
  "frame_size": {"width": 1920, "height": 1080},
  "detections": [
    {
      "frame": 120,
      "time_ms": 2000,
      "ball_box": [100, 100, 130, 130],
      "ball_confidence": 0.78,
      "rim_box": [900, 260, 980, 310],
      "rim_confidence": 0.66
    }
  ]
}
```

输出：

```json
{
  "schema_version": "ball_trajectory.v1",
  "status": "tracked|candidate|insufficient_evidence|not_available",
  "confidence": 0.0,
  "trajectory_points": [
    {"frame": 120, "time_ms": 2000, "x": 115.0, "y": 115.0, "confidence": 0.78}
  ],
  "rim_reference": {
    "frame": 130,
    "box": [900, 260, 980, 310],
    "confidence": 0.66
  },
  "events": [
    {
      "event_id": "shot_candidate_1",
      "status": "candidate",
      "release_frame": 120,
      "rim_cross_frame": 145,
      "release_angle_deg": 46.0,
      "ball_path_offset_cm": 8.0,
      "judgement": "unknown|candidate_made|candidate_missed"
    }
  ],
  "missing_evidence": []
}
```

## 轨迹卡片

前端需要独立 Ball Trajectory Card，不能只把球路塞进通用指标列表。

卡片字段：

- `status`
- `confidence`
- `sampled_frames`
- `valid_ball_points`
- `rim_detected`
- `release_angle_deg`
- `ball_path_offset_cm`
- `shot_result_candidate`
- `why_low_confidence`
- `next_video_request`

卡片状态：

- `tracked`：连续多帧球点、篮筐参考、过筐序列都满足。
- `candidate`：有球和篮筐，但轨迹不连续或过筐序列不完整。
- `insufficient_evidence`：球或筐缺失、遮挡、抽帧不足。
- `not_available`：adapter 未配置、视频不可读或模块未运行。

## 视频 overlay

可视化层应显示：

- 球心轨迹点和连接线。
- 篮筐参考框或参考线。
- release frame。
- rim cross frame。
- 置信度颜色：高置信绿色、中置信黄色、低置信灰色。

当前最小候选 overlay 已接入前端 `poseCanvas`：当 `ball_trajectory.trajectory_points` 存在时，页面会绘制球心点、连接线、篮筐参考框、release 标记、rim-cross 标记和候选置信标签。该 overlay 只证明前端可视化合同，不证明真实视频稳定追踪。

## 解释边界字段

当前模块实现位于 `server/ballTrajectory.mjs`，由 `server/visionPipeline.mjs` 写入 `evidence_packet.v1.ball_trajectory`。每个 `ball_trajectory.v1` 输出必须保留：

- `source_contract="candidate_only_yolo_adapter_output_not_stable_tracking"`
- `interpretation_policy="candidate_visualization_only_not_diagnosis"`
- `diagnosis_allowed=false`
- `valid_ball_points`
- `sampled_frames`
- `rim_detected`

这些字段用于阻止后续报告层把 YOLO 启发式球路当成稳定动作诊断来源。

## 失败提示

失败时必须提示具体原因：

- `ball_not_detected`
- `rim_not_detected`
- `not_enough_consecutive_frames`
- `camera_view_not_suitable`
- `low_resolution_or_motion_blur`
- `adapter_not_configured`
- `adapter_error`
- `ball_occluded_by_body`
- `rim_out_of_frame`
- `multiple_ball_candidates`

提示文案应转成可执行重拍建议，例如“请从侧后方录制，确保球和篮筐同时入镜 3-5 秒”。

## 低置信边界

- 只有抽帧球点，没有连续轨迹：只能 `candidate`。
- 没有篮筐参考：不得判断命中/未中。
- 只有篮筐没有球：不得判断球路。
- 球被手臂、身体或画面边缘遮挡：只输出 missing evidence。
- 正面视频可辅助左右偏移，但不适合稳定估计深度方向轨迹。
- 侧面视频可辅助高度和出手角，但不适合稳定判断左右偏移。

## 验收基线

当前已完成 Phase 3 的模块边界加固：`server/ballTrajectory.mjs` 独立生成 `ball_trajectory.v1`，`evidence_packet.v1` 内保留独立 `ball_trajectory` 字段，前端有独立 Ball Trajectory Card，并有候选视频 overlay 源码绑定。`scripts/phase3-ball-trajectory-smoke.mjs` 已从 `data/fixtures/phase3-ball-trajectory-adapter-fixtures.json` 回放 12 个 synthetic adapter fixture，覆盖 `not_available`、`insufficient_evidence`、`candidate` 和合同级 `tracked` 状态；失败原因覆盖 `adapter_not_configured`、`adapter_error`、`ball_not_detected`、`rim_not_detected`、`not_enough_consecutive_frames`、`camera_view_not_suitable`、`low_resolution_or_motion_blur`、`ball_occluded_by_body`、`rim_out_of_frame`、`multiple_ball_candidates`，并检查 candidate-only 解释边界、前端候选 overlay 和重拍建议绑定。

仍需注意：该 smoke 不证明真实视频稳定 2D 球轨迹，也不证明真实 YOLO adapter 的命中/未中判断。

验收必须继续确认：

- 当前 YOLO 是启发式。
- 球轨迹是独立模块目标。
- 报告不得把 `provided_by_yolo_heuristics` 当稳定结论。
- 低置信或缺篮筐时必须显示失败提示和重拍建议。
