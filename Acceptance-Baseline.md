# Acceptance Baseline

Updated: 2026-06-15

## 目标

定义 Phase 0.5 后每次验收的最低基线：本地 check、页面验收、模型 adapter 验收和知识库验收。

## 命令验收

首选：

```bash
npm run check
```

如果当前 shell 没有 `node/npm`，使用 README 中的 bundled Node：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.mjs --check
```

通过标准：

```json
{
  "ok": true,
  "checked": [
    "knowledge_base",
    "server_modules",
    "sample_manifest",
    "authorized_sample_readiness",
    "phase_0_5_docs",
    "adapter_configuration"
  ],
  "errors": []
}
```

该命令必须确认：

- `distillation/douyin-shooting-coach/outputs/knowledge_base.json` 可读且统计值符合当前基线。
- `data/sample_manifest.json` 可读，至少包含一个本地授权样例，样例文件存在，且授权 scope、禁止用途、not-for-diagnosis 和样例元数据符合当前基线。
- Phase 0.5 的 11 个文档存在。
- adapter 配置状态可见，但不要求在 `--check` 中实际运行重模型推理。

## MVP 聚合验收

完整本地基线：

```bash
npm run acceptance
```

如果当前 shell 没有 `node/npm`，使用 bundled Node：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mvp-acceptance-smoke.mjs
```

该 runner 必须顺序验证：

- `server/index.mjs --check` 通过，且知识库可读。
- 核心前端、后端和 smoke 脚本语法检查通过。
- 产品承诺边界扫描通过，不得把登录/云端、稳定球轨迹、最终评分公式或真实校队视频默认用途写成已完成能力。
- Phase completion audit 通过，确认 Phase 1-7 的 Goal Backlog、交付物、package scripts、Acceptance Baseline、Handoff 证据和剩余外部缺口保持一致。
- 样例 manifest smoke 通过，确认本地样例授权、禁止用途、not-for-diagnosis 和文件元数据。
- 授权样例 readiness smoke 通过，确认未来真实/代表性样例的授权元数据门禁存在，且当前 manifest 仍没有可用真实样例。
- 移动布局 source smoke 和 390x844 浏览器 smoke 通过。
- Phase 1-7 的合同 smoke 和浏览器/UI smoke 通过。
- 运行过程中清空 `DEEPSEEK_API_KEY`、`YOLO_COMMAND` 和 `RTMPOSE_COMMAND`，避免付费 API 或本机重模型成为本地验收硬依赖。

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "mvp_acceptance_smoke.v1",
  "source_contract": "phase_1_to_7_local_acceptance_runner"
}
```

该 runner 证明本地 synthetic/授权样例和合同链路可复跑，不证明真实校队视频诊断质量、稳定球轨迹、精确多机位同步、登录云端或最终评分公式。

边界扫描可单独运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/boundary-claims-smoke.mjs
```

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "boundary_claims_smoke.v1",
  "source_contract": "no_false_completed_claims_for_mvp_boundaries"
}
```

Phase completion audit 可单独运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase-completion-audit.mjs
```

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "phase_completion_audit.v1",
  "source_contract": "static_phase_1_to_7_completion_evidence_audit"
}
```

该审计只检查 Phase 1-7 的本地完成证据链和剩余边界是否保留，不替代功能 smoke、浏览器 smoke、真实授权样例验证、云端方案或评分研究。

样例 manifest smoke 可单独运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sample-manifest-smoke.mjs
```

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "sample_manifest_smoke.v1",
  "source_contract": "authorized_local_synthetic_samples_only"
}
```

授权样例 readiness smoke 可单独运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-ui-smoke.mjs
```

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "authorized_sample_readiness_smoke.v1",
  "source_contract": "metadata_only_no_real_video_file_access"
}
```

该脚本只检查授权样例 metadata 合同和 fixture，不读取、上传、解码或分析真实视频文件。

UI/API smoke 还必须确认：

- `GET /api/authorized-sample-readiness` 返回 `authorized_sample_readiness_audit.v1`。
- 当前 manifest 状态为 `waiting_for_authorized_samples`，`candidate_sample_count=0`，`ready_sample_count=0`。
- 上传面板存在 `样例授权门禁` 卡片、`sampleReadinessStatus` 和 `sampleReadiness`。
- 前端展示 metadata-only 边界文案，不提高诊断置信度。

授权 Alpha 本地流程 smoke 可单独运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-alpha-analysis-smoke.mjs
```

通过输出必须包含：

```json
{
  "ok": true,
  "schema_version": "authorized_alpha_analysis_smoke.v1",
  "source_contract": "local_authorized_alpha_test_not_diagnosis"
}
```

该脚本用 synthetic sample 模拟本地上传，不读取真实校队视频。验收要求：

- 缺失 `tester_agreement_id` 的请求必须返回 `status=rejected`。
- 有效授权必须包含 `authorization.local_analysis=true`、`authorization.local_acceptance_test=true`，且 `allow_public_showcase`、`allow_external_distribution`、`allow_cloud_storage`、`allow_model_training` 全部为 `false`。
- `POST /api/authorized-alpha-analysis` 必须返回 `authorized_alpha_analysis.v1` 和 `source_contract=local_authorized_alpha_test_not_diagnosis`。
- evidence 必须包含 `alpha_test.schema_version=authorized_alpha_test.v1`、`diagnosis_allowed=false`、`video_context.source_type=authorized_alpha_test_local_upload`、`confidence.max_report_confidence=low` 和 `pipeline_status.alpha_test_layer=authorized_local_review_only`。
- 保存 session 必须是 `short_term_review`，且 `long_term_written=false`。
- `/api/privacy-export` 仍必须声明 `raw_video_bytes=excluded`、`cloud_sync=not_implemented`，并在上传清单中列出该本地上传文件。
- 前端上传面板必须有 `Alpha 授权测试`、`alphaAgreementId`、`alphaLocalAuthorization`、`runAlphaTestButton`，并调用 `/api/authorized-alpha-analysis`。
- 该验收不证明真实球员诊断质量、稳定球轨迹、精确同步、登录云端或最终评分公式。

## 本地页面验收

启动：

```bash
node server/index.mjs
```

或：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.mjs
```

打开：

```text
http://localhost:4173
```

检查项：

- 页面可加载。
- 知识库摘要显示版本、规则卡数量和 signal。
- 上传控件可选择本地视频。
- 视频按真实 `videoWidth/videoHeight` 显示，不拉伸成错误宽高。
- MediaPipe 可用时显示真实骨架；不可用时显示降级原因。
- MediaPipe CDN 版本必须可访问；当前前端使用 `@mediapipe/tasks-vision@0.10.35`。
- 关键点足够时，overlay 可绘制基于当前帧的脚膝髋力线、肩肘腕线、辅助手线、躯干线和发力链线。
- 关键点缺失或置信不足时，不得绘制静态假线。
- 分析后显示 evidence、metrics、matched rules、missing evidence、model health。
- Ball Trajectory Card 可显示 tracked/candidate/not_available/insufficient_evidence 状态。
- 选择补充视角后，页面可调用 multi-angle 分析并显示 present/missing views 和 merged metrics 摘要。
- 报告显示 DeepSeek 或 local fallback mode。
- session 能写入 SQLite 并在页面记忆摘要中体现。
- 记忆卡显示本地用户、主目标、趋势来源、训练目标和历史候选信号。
- 隐私边界卡显示 raw video 本地保存、SQLite 本地记忆、cloud sync 未实现和默认禁止用途。

## 移动布局验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-layout-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/mobile-browser-smoke.mjs
```

当前本地 Web 原型的移动端基线：

- 页面必须保留 viewport meta。
- 900px 以下必须切换为单列 workspace，不得保留隐式第二列。
- `side-rail` 必须回到 `grid-column: 1` 和 `grid-row: auto`。
- evidence、lab、feedback、cleanup、knowledge 和 multi-angle audit 行必须能单列显示。
- 视频区域必须保持稳定比例，不得固定桌面高度导致裁切。
- 560px 以下 keyframes 必须单列。
- headless Chrome 390x844 验收必须无横向溢出、无浏览器 error，且 workspace、side-rail、evidence、keyframes 的 computed layout 都为单列。

该基线不等于 iOS App、小程序或 PWA 验收，也不证明真实手机文件选择和上传体验。

## Phase 1 样例闭环验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-smoke.mjs
```

页面样例入口脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-ui-smoke.mjs
```

授权真实/代表性样例 readiness 脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/authorized-sample-readiness-ui-smoke.mjs
```

样例重建命令：

```bash
swift scripts/generate-synthetic-sample.swift data/synthetic_ball.mp4
```

该脚本必须：

- 只读取 `data/sample_manifest.json` 中 `authorization.status=authorized` 且包含 `local_acceptance_test` 的样例。
- 临时启动本地 server，并清空 `DEEPSEEK_API_KEY`、`YOLO_COMMAND`、`RTMPOSE_COMMAND`，避免外部服务或重模型成为 smoke 硬依赖。
- 上传样例视频，生成 `evidence_packet.v1`。
- 调用 `/api/coach-report` 并返回 `player_report.v1` 和 `lab_report.v1`。
- 写入 `short_term_review` session，且 `long_term_written=false`。
- 读取 `/api/memory-summary`，确认 `confidence_policy.trend_source=long_term_only`。
- 结束前删除测试 session 和当前上传原始文件。

页面样例入口脚本必须：

- `GET /api/samples` 只返回本地授权样例，且不暴露绝对文件路径。
- `GET /api/sample-videos/:id` 支持视频 range 读取，且只允许读取授权样例。
- `synthetic_ball` 样例必须保持浏览器可读的 640x360、30fps、2.4s 基线。
- 不经过上传目录也能用 `sample_id` 生成 `evidence_packet.v1`。
- 真实或代表性样例进入 manifest 前，必须通过 metadata-only readiness gate；该 gate 要求本地分析/本地验收授权、主体授权记录、本地保存期限、禁止公开/外发/云端/训练用途，以及 readiness-safe 诊断置信边界。
- 页面必须显示 readiness gate 当前状态，让教练或维护者知道还没有真实/代表性样例可以用于本地验收。

## Phase 2 报告 UI 验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-contract-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-ui-browser-smoke.mjs
```

浏览器 UI smoke 必须：

- 加载本地授权 synthetic sample，不读取真实校队视频。
- 点击页面上的报告生成主流程，而不是只调用后端 API。
- 在 `#coachReport` 中显示“球员版报告”和“实验室版摘要”两个分区。
- 显示 `player_report.v1`、`lab_report.v1`、`Evidence Trace`、`signal_id`、`metric_id`、`rule_id`、`missing_evidence`、模型状态和 adapter fallback。
- 把本次浏览器 smoke 新写入的 SQLite session 删除。

## Phase 5 动态画线浏览器验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-dynamic-lines-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-browser-visual-smoke.mjs
```

浏览器 visual smoke 必须：

- 加载本地授权 synthetic sample，不读取真实校队视频。
- 注入 deterministic synthetic RTMPose keypoints 和 metric series。
- 验证 `#poseCanvas` 非空且存在教练线颜色像素。
- seek 后阶段标签发生变化。
- 低分关键点时教练线像素显著下降，并显示“不绘制教练线”降级文案。
- `#overlayDiagnostics` 必须显示 `coach_overlay_diagnostics.v1`、`source_check_only_not_real_sample_readability`、`rtmpose_precision_pose`、`phase_source=evidence_keyframes_not_classifier`、`candidate_only_not_stable_tracking`、`local_browser_png_current_frame_no_video_export` 和低置信 guard。
- 本地当前标注帧导出必须返回 `annotated_frame_export.v1`，`source_contract=local_browser_png_current_frame_no_video_export`，并证明 PNG 同时包含当前视频帧和 overlay canvas。
- 导出后的本地 review 区必须显示最近标注帧缩略图；该缩略图只保存在浏览器内存，最多保留最近 3 张，不写入 SQLite、`data/uploads/`、云端或视频文件。
- 输出必须声明 `browser_canvas_visual_check_synthetic_keypoints_and_candidate_trajectory`，不得把它写成真实样例可读性、稳定球轨迹或独立动作阶段分类器验收。
- good frame 必须同时包含教练线颜色像素和候选球轨迹颜色像素，并在 `pose_status` 中显示叠加候选球路点数量。
- sample evidence 必须写入 `video_context.sample_id` 和 `pipeline_status.video_layer=local_authorized_sample_ready`。
- 前端必须存在 `sampleSelect`、`loadSampleButton` 和 `sampleStatus`，并绑定 `/api/samples`。
- 前端加载 synthetic 授权样例时，记忆写入必须自动切到 `short_term_review`，避免把验收样例写入长期个人记忆。

该脚本仍不证明真实球员诊断质量、稳定球轨迹、命中判断、登录、云端同步或评分公式。

## Report Contract 验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase2-report-contract-smoke.mjs
```

该脚本必须：

- 上传授权 synthetic sample，并生成 `evidence_packet.v1`。
- 调用 `/api/coach-report`，确认 legacy `report`、`player_report.v1` 和 `lab_report.v1` 同时存在。
- 确认 `player_report.confidence` 不超过 `evidence.confidence.max_report_confidence`。
- 确认 player/lab report 的 evidence refs 可追溯到当前 evidence 的 `signal_id`、`metric_id`、`frame`、`rule_id` 或 `missing_evidence`。
- 前端必须显式展示 `Evidence Trace`，并把 `signal_id`、`metric_id`、`frame`、`rule_id`、`missing_evidence` 作为 trace 字段展示；该面板只用于追溯，不提高诊断置信度。
- 低证据时，player report 必须通过 `uncertainties[].missing_evidence` 表达复核原因。
- lab report 必须保留 metrics、signals、matched_rules、missing_evidence、model_status 和 debug report mode。
- 前端 `main.js` 必须包含球员版报告和实验室版摘要的渲染绑定。

该脚本不证明真实球员诊断质量，也不证明 DeepSeek 外部调用质量。

## Ball Trajectory 合同验收

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-smoke.mjs
```

该脚本必须覆盖：

- fixture 文件：`data/fixtures/phase3-ball-trajectory-adapter-fixtures.json`，`schema_version=phase3_ball_trajectory_adapter_fixtures.v1`，`source_contract=synthetic_adapter_output_replay_no_real_video`。
- adapter 未配置：`status=not_available`，包含 `adapter_not_configured`、`ball_not_detected`、`rim_not_detected`。
- 缺球：`status=insufficient_evidence`，包含 `ball_not_detected`。
- 缺筐：`status=insufficient_evidence`，包含 `rim_not_detected`。
- 轨迹稀疏：`status=candidate`，包含 `not_enough_consecutive_frames`。
- 球被身体/手臂遮挡：`status=candidate`，包含 `ball_occluded_by_body`。
- 篮筐出画或被裁切：`status=insufficient_evidence`，包含 `rim_not_detected` 和 `rim_out_of_frame`。
- 多个疑似篮球候选：`status=candidate`，包含 `multiple_ball_candidates`。
- 合同级 tracked fixture：`status=tracked`，事件只能是 `candidate`，命中判断必须是 `candidate_made` 或 `candidate_missed`。
- 低置信事件：`event.status=low_confidence_candidate`。
- `ball_trajectory.v1` 必须由 `server/ballTrajectory.mjs` 生成，并保留 `source_contract=candidate_only_yolo_adapter_output_not_stable_tracking`、`interpretation_policy=candidate_visualization_only_not_diagnosis`、`diagnosis_allowed=false`。
- 前端必须保留独立 Ball Trajectory Card 和候选视频 overlay 绑定：球心点、连接线、篮筐参考、release marker、rim-cross marker、低置信边界文案和下一次重拍建议。

该脚本使用 synthetic adapter fixture replay 和源码契约检查，不证明真实视频稳定 2D 球轨迹、稳定命中判断或真实 YOLO adapter 效果。

## 模型 adapter 验收

YOLO：

- 未配置 `YOLO_COMMAND` 时，系统必须显示 `adapter_not_configured`。
- 配置后 health check 返回 engine、status、checks、weights、missing。
- 低置信、缺球或缺筐时不得输出稳定球轨迹结论。

RTMPose/MMPose：

- 未配置 `RTMPOSE_COMMAND` 时，系统必须显示 `adapter_not_configured`。
- 配置后 health check 返回 engine、status、model、device、checks、missing。
- 有效视频应返回 `pose_series`；低置信视频必须降级。

DeepSeek：

- 未配置 `DEEPSEEK_API_KEY` 时使用 local fallback。
- 配置后返回必须通过 `validateCoachReport()`。
- 校验失败必须 fallback，不展示非法引用。

## 知识库验收

当前基线：

- `knowledge_base.json` 可读。
- `source_count=203`。
- `cards=203`。
- `signal_registry.signals=9`。
- `diagnosis_rule_count=551`。
- `repair_action_count=207`。

检查方式：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e "const fs=require('fs'); const kb=JSON.parse(fs.readFileSync('distillation/douyin-shooting-coach/outputs/knowledge_base.json','utf8')); console.log({source_count:kb.source_count,cards:kb.cards.length,signals:kb.signal_registry.signals.length,diagnosis_rule_count:kb.taxonomy.diagnosis_rule_count,repair_action_count:kb.taxonomy.repair_action_count})"
```

## 样例清单验收

当前 Phase 1 样例清单：

- 文件：`data/sample_manifest.json`。
- 样例：`data/synthetic_ball.mp4`。
- 类型：合成样例，不是真实校队视频。
- 允许用途：本地分析、本地验收测试。
- 禁止用途：公开展示、外部分发、云端保存、模型训练。

该样例只能用于 adapter、上传和验收 smoke，不得用于球员动作诊断。

## Ball Trajectory 浏览器验收

当前 Phase 3 浏览器 DOM 验收：

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase3-ball-trajectory-ui-smoke.mjs
```

- 浏览器页面必须先加载本地授权 synthetic sample，再真实渲染 `#ballTrajectoryStatus` 和 `#ballTrajectoryCard`。
- adapter 报错时，卡片显示 `adapter_error`、不显示候选轨迹预览，并给出 adapter 健康检查/复测建议。
- 视角不适合时，卡片显示 `camera_view_not_suitable`，并提示改用侧后方或侧面视角。
- 球被遮挡时，卡片显示 `ball_occluded_by_body`，并提示避免投篮手、辅助手、身体或画面边缘遮挡。
- 有候选球路点时，卡片显示 `.trajectory-preview`，但文案必须保留“不是稳定 2D 球轨迹承诺”。
- 卡片必须显示 `candidate_visualization_only_not_diagnosis` 和“不直接支撑动作诊断”。
- 有候选球路点时，`#poseCanvas` 必须画出候选视频 overlay，并在无人体关键点时显示“候选球路点；当前没有可用人体关键点”的降级状态。
- adapter 报错或无轨迹点时，不得绘制假球路 overlay。
- 候选命中只能显示 `candidate_made`，不得显示 confirmed make/miss。
- 该验收只使用 synthetic evidence，不代表真实样例球轨迹质量已达标。

## Multi-Angle 验收

当前 Phase 4 最小验收：

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-smoke.mjs
```

浏览器 UI 验收：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase4-multi-angle-ui-smoke.mjs
```

- `POST /api/analyze-multi-angle` 返回 `schema_version=multi_angle_evidence_packet.v1`。
- 同时传入 front 和 side 时，`present_views` 包含两个视角，`missing_views` 为空。
- merged metrics 必须保留 `source_view`。
- 只传一个视角时，缺失视角必须写入 `missing_required_view`。
- merged signals 必须保留 `source_view`，merged rules 必须保留 `source_views`。
- `sync_policy` 必须是 `approximate_session_grouping_no_manual_keyframe_sync`。
- `sync_assessment.schema_version` 必须是 `sync_assessment.v1`，`precision=not_frame_accurate`，并包含 `approximate_session_grouping`、`no_shared_clock`、`no_manual_keyframe_sync` 和 `no_sync_marker` 原因。
- `sync_assessment` 必须返回 `risk_level`、`risk_factors` 和 `retake_guidance`；`risk_factors` 至少包含 `no_frame_accurate_sync`、`no_shared_clock` 和 `no_sync_marker`。
- `view_quality_assessment.schema_version` 必须是 `view_quality_assessment.v1`，`source_contract=metadata_and_evidence_context_only_not_real_frame_quality`；single-angle 时必须返回 `insufficient` 和 `view_quality_missing_<view>`，front+side metadata 满足合同时必须返回 `metadata_ready` 和 `view_quality_front_side_metadata_ready`。
- `/api/coach-report` 必须能消费 `multi_angle_evidence_packet.v1`，并在 `lab_report.multi_angle_context` 中保留 `present_views`、`missing_views`、`sync_policy`、`sync_assessment.v1`、`precision=not_frame_accurate` 和 sync risk evidence。
- `/api/coach-report` 必须在 `lab_report.multi_angle_context.view_quality_assessment` 中保留视角质量评估；非 `metadata_ready` 时必须作为降级原因处理。
- side-only 报告的 `player_report.next_video_request.view` 必须优先请求缺失的 `front`，不能被 fallback 自由文本误解析成完整多角度已满足。
- 前端必须存在补充视角上传控件、补充视角选择和 Multi Angle 摘要区域。
- 前端 Multi Angle 区域必须显示同步评估、同步风险、视角质量评估、视角证据清单、关键指标来源、视角缺失影响和 approximate sync policy，不得写成精确同步或真实画面质量分析。
- 浏览器 UI smoke 必须真实调用 `/api/analyze-multi-angle`，并确认 front+side 与 side-only packet 都能渲染到 DOM。
- side-only 时必须显示 front 视角缺失、`missing_front_view`、同步风险、`view_quality_missing_front` 和视角缺失影响；front+side 时必须显示 present views、Metric Views、Signal Views、Rule Views、关键指标来源、`sync_assessment.v1`、`view_quality_front_side_metadata_ready`、`metadata_and_evidence_context_only_not_real_frame_quality`、`no_sync_marker` 和 approximate grouping 文案。
- 当前不要求精确跨机位同步，不允许把 approximate grouping 写成稳定同步能力；当前视角质量层只做 metadata/evidence-context 检查，不允许写成真实帧画质判断。

## 动态画线验收

当前 Phase 5 最小验收：

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase5-dynamic-lines-smoke.mjs
```

- 页面加载时 MediaPipe 初始化成功或显示明确 fallback。
- `app/main.js` 中的动态线只使用 MediaPipe 当前帧 landmarks 或 RTMPose 当前帧 keypoints。
- 能绘制脚膝髋、肩肘腕、辅助手、躯干和发力链线。
- 能绘制膝、髋、肘、躯干角度弧线。
- 加载 evidence 后，能显示来自 `metric_series` keyframes 的最小阶段标签。
- 缺关键点、低 visibility 或低 score 时跳过对应线条。
- Overlay Diagnostics 能解释 overlay 来源、line count、阶段来源、候选球路 overlay、`visibility<0.5 / score<0.2` guard 和本地 PNG 导出边界。
- 可本地导出当前标注帧 PNG；该能力不是带画线视频导出，也不上传云端。
- 该脚本只做源码契约检查；真实样例可读性、独立动作阶段分类器、导出画线视频仍不是已验收能力。

## 个人记忆验收

当前 Phase 6 最小验收：

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-smoke.mjs
```

浏览器 UI 验收：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase6-memory-ui-smoke.mjs
```

- `GET /api/memory-summary` 返回 `profile`、`training_goals`、`recurring_signals` 和 `confidence_policy`。
- `confidence_policy.trend_source` 必须是 `long_term_only`。
- `short_term_review` session 不进入长期趋势。
- 两条 long-term session 和一条 short_term_review session 同时存在时，`trend.values` 只能包含 long-term 数据，`review_sessions_excluded=1`。
- recurring signals 只从 long-term session 统计。
- 前端记忆卡必须展示本地用户、主目标、趋势来源、训练目标和历史候选信号。
- 浏览器 UI smoke 必须用隔离测试用户渲染记忆卡，确认 `2 long-term / 1 review`、`long_term_only`、`review excluded: 1`、趋势 delta、训练目标、历史候选信号和 2 个趋势柱可见。
- `DELETE /api/sessions/:session_id` 可删除本地 SQLite session。
- `DELETE /api/users/:user_id/sessions` 可删除某个本地用户的全部 SQLite sessions，返回 `scope=local_sqlite_sessions_only` 且 `raw_video_deleted=false`。
- smoke 创建的测试 session 必须在结束前删除，删除后测试用户 `session_count=0`。
- 前端最近本地记录列表必须提供删除按钮，且删除前提示不会删除上传视频文件。
- 当前不要求登录、账号、云端同步或跨设备恢复。

## 隐私边界验收

当前 Phase 7 可落地的本地验收：

可重复脚本：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-smoke.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase7-privacy-ui-smoke.mjs
```

- `GET /api/privacy-boundary` 返回 `schema_version=privacy_boundary.v1`。
- `storage.cloud_sync` 必须是 `not_implemented`，除非用户明确确认云端方案。
- `model_use.raw_video_to_report_model` 必须是 `false`。
- `default_forbidden_uses` 必须包含公开展示、外部分发、云端保存和模型训练。
- 前端隐私卡必须显示 local-only 状态和默认禁止用途。
- `DELETE /api/uploads/:upload_id` 可删除当前进程已登记的本地上传原始文件，并且删除路径必须限制在 `data/uploads/`。
- `GET /api/upload-files` 可列出受控本地上传文件，返回 `schema_version=upload_file_inventory.v1`。
- `DELETE /api/upload-files/:file_name` 可逐个删除受控历史上传文件，非受控文件名必须拒绝。
- `POST /api/upload-files/cleanup` 返回 `schema_version=upload_cleanup.v1`；`dry_run=true` 不删除文件，`dry_run=false` 才执行删除。
- `GET /api/privacy-export` 返回 `schema_version=privacy_export.v1`，`scope=local_json_export_no_raw_video_bytes`，且 `storage.raw_video_bytes=excluded`。
- `DELETE /api/users/:user_id/sessions` 必须只删除该本地用户的 SQLite sessions，不删除上传原始视频文件；API smoke 必须创建 2 条隔离 session，删除后 `sessions_after_delete=0`。
- 前端主视频和补充视角必须有上传原始文件删除按钮；未上传时按钮禁用。
- 前端隐私卡必须显示本地上传文件列表、逐个删除按钮、保留期输入、预览清理按钮和执行清理按钮。
- 前端隐私卡必须提供本地 JSON 导出按钮，并说明不包含原始视频字节。
- 前端隐私卡必须提供本地 `user_id` 输入和删除该用户本地 SQLite sessions 的按钮；浏览器 UI smoke 必须验证 2 条隔离 session 被删除且导出后 session 数为 0。
- 浏览器 UI smoke 必须在 390x844 viewport 中验证 local-only、local SQLite、cloud sync 未实现、默认禁止用途、JSON 导出说明、受控上传文件列表和清理控件可见。
- 浏览器 UI smoke 必须通过隐私卡逐个删除一个受控临时上传文件，并确认文件从 `data/uploads/` 消失。
- 浏览器 UI smoke 的保留期 dry-run 必须显示候选文件，且不得删除该文件。
- smoke 只能创建和删除受控临时上传文件，不得读取、上传或删除真实校队视频。
- 本地 session 删除、本地用户 SQLite sessions 批量删除、上传原始文件删除和本地 JSON 导出都不等于真实校队视频授权撤回、云端导出或云端删除。
- 当前不要求登录、账号、组织权限、云端同步或跨设备恢复。

## 禁止项自检

文档、UI 和报告不得把以下内容写成已完成事实：

- 登录。
- 账号。
- 云端同步。
- 稳定 2D 球轨迹。
- 稳定命中/未中判断。
- 教练式动态力线、角度线、发力链线。
- 最终评分公式。
- 真实校队视频可公开展示、外部分发、云端保存或训练模型。

## Phase 验收基线

每个后续 Phase 必须包含：

- 可运行入口。
- 可看到的界面或 JSON 结果。
- 可复测的样例或负向测试。
- 明确完成标准。
- 明确验证命令或验收路径。
- 明确约束和不可承诺能力。

不允许用空泛占位语作为任务内容。未确定事项必须写成“待确认问题”，不能作为交付物。
