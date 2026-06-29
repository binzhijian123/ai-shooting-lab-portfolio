# Authorized Real Sample Test Report

Date: 2026-06-16

## Scope

本报告只覆盖用户本地提供的 `测试用例/` 视频文件。测试过程保持本地运行：

- 不上传外部平台。
- 不启用云端保存。
- 不用于模型训练。
- 不公开展示真实视频内容。
- DeepSeek 报告调用在测试脚本中被禁用，使用本地 fallback 报告。

## Inputs

`测试用例/` 下发现 12 个 `.MOV` 文件，均为竖屏 HEVC 视频，尺寸约 1080x1920，时长约 0.63s 到 6.1s。

代表性三视角本地运行样例：

| File | Assigned View | Duration | Metadata | Notes |
| --- | --- | ---: | --- | --- |
| `IMG_6316.MOV` | `side` | 4233ms | `metadata_ready`, OpenCV, 30fps, 1080x1920 | 侧面代表样例 |
| `IMG_6317.MOV` | `side_back_candidate` | 4233ms | `metadata_ready`, OpenCV, 30fps, 1080x1920 | 侧后方代表样例 |
| `IMG_6318.MOV` | `front` | 2600ms | `metadata_ready`, OpenCV, 30fps, 1080x1920 | 正面代表样例 |

`IMG_6321.MOV` 只有约 633ms，按当前输入合同应视为过短，高风险或不可分析样例。

## Commands

语法检查：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check scripts/authorized-real-folder-smoke.mjs
```

代表三视角单角度测试：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-real-folder-smoke.mjs --single-only --folder 测试用例 --files IMG_6318.MOV,IMG_6316.MOV,IMG_6317.MOV
```

完整 MVP 回归：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mvp-acceptance-smoke.mjs
```

## Results

### Adapter Health

`/api/model-health` 显示：

- YOLO: configured, healthy.
- RTMPose/MMPose: configured, healthy.

初次测试时，RTMPose 对侧面和侧后方样例超时。已修复为抽帧推理后，三条代表样例都能返回 `provided_by_adapter`：

- `IMG_6316.MOV`: `precision_layer=provided_by_adapter`.
- `IMG_6317.MOV`: `precision_layer=provided_by_adapter`.
- `IMG_6318.MOV`: `precision_layer=provided_by_adapter`.

完整三视角本地 smoke 耗时约 43.3s，仍主要花在 YOLO/RTMPose adapter 推理上。

### Single Angle

| File | View | Result | Confidence | Main Missing Evidence |
| --- | --- | --- | --- | --- |
| `IMG_6316.MOV` | side | `review_only` | low | missing front, 60fps |
| `IMG_6317.MOV` | side_back_candidate | `review_only` | low | missing front, missing side, 60fps |
| `IMG_6318.MOV` | front | `review_only` | low | missing side, 60fps |

YOLO produced candidate-only ball trajectory for all three representative files:

- `source_contract=candidate_only_yolo_adapter_output_not_stable_tracking`
- `diagnosis_allowed=false`
- point counts: 2, 4, 5

### Safety Fix Applied

测试暴露出一个过度自信问题：修复前，`IMG_6318.MOV` 正面单角度视频在缺侧面视角和 60fps 的情况下被标为 `high/diagnosable`。

已在 `server/visionPipeline.mjs` 加固：

- 单角度缺少 signal 所需视角时，signal status 改为 `missing_required_view`。
- 缺少必要视角时，overall confidence cap 到低置信区间。
- 30fps 低于 60fps 时，置信度被降级。

修复后，`IMG_6318.MOV` 变为 `max_report_confidence=low`、`analysis_status=review_only`。

### Multi Angle

多角度 API 已支持复用已有 `evidence_packet.v1`，避免同一上传在单角度、Alpha、多角度里重复跑 YOLO/RTMPose。修复后完整三视角脚本完成 multi-angle 合同验证：

- `front + side`: `multi_angle_evidence_packet.v1`, `present_views=["front","side"]`, `missing_views=[]`, `view_quality_status=metadata_ready`, `sync_precision=not_frame_accurate`, `sync_risk_level=high`.
- `front + side_back_candidate`: 缺少 required `side`，`view_quality_status=insufficient`。
- `side_back_candidate` only: 缺少 `front` 和 `side`，`view_quality_status=insufficient`。

结论：当前可达到“本地合同验收”，但不证明同一次投篮的精确多机位同步，也不证明真实诊断质量。

## Acceptance Verdict

当前 Phase 1-7 本地验收标准：通过。

- 上传、metadata、YOLO candidate ball trajectory、报告合同、隐私边界、review-only 降级都能工作。
- `scripts/mvp-acceptance-smoke.mjs` 通过，最新基线为 `command_count=58`, `syntax_files=35`, `smoke_steps=21`, `infrastructure_retries=0`。

真实产品诊断验收标准：未达到。

原因：

- 这批视频不是已证明同步的同一次投篮 front + side 采集。
- 所有样例为 30fps，不满足 60fps 时序诊断优先要求。
- 侧后方不等于 Phase 4 必需的 `side` 视角，会正确降级。
- RTMPose 已可处理三条代表 `.MOV`，但真实视频 adapter 推理仍偏慢，需要继续优化采样、缓存和设备选择。
- 多角度 API 已支持复用 evidence packet；产品 UI 已接上主视角 evidence packet 复用路径，避免同一次用户分析里主视角重复等待模型。配对视角仍按本地分析路径生成证据。
- 上传面板已前置输入合同提示：非 `front`/`side` 视角、低于 30fps、低于 60fps 时序偏好、短于 1500ms、低于 640x360 的 metadata 都会显示降级或重拍建议；这只是合同提示，不代表真实画面质量或诊断质量验证。
- 球轨迹仍是 candidate-only，不是稳定 2D tracking 或命中判断。

## Recommended Next Fixes

1. 继续优化 RTMPose 真实视频耗时：采样帧数上限、设备选择、模型预热、缓存和超时分层。
2. 若要验证产品级诊断，需要补拍同一次投篮的 `front + side`，最好 60fps，并保留出手前后 1-2 秒。
