# Development Plan

Updated: 2026-06-15

## 原则

- 每个 Phase 必须可运行、可看到效果、可验收。
- Phase 1-7 的本地基线必须能通过 `scripts/mvp-acceptance-smoke.mjs` 一次性复跑；聚合验收包含产品承诺边界扫描，单项 smoke 仍作为定位问题的入口。
- 高风险模块前置：验收基线、球轨迹、多角度、动态画线、隐私。
- 不抓取外部平台内容。
- 不读取或上传真实校队视频，除非用户明确提供并授权。
- 不引入付费 API 或外部服务作为硬依赖，除非用户确认。

## Phase 1: 验收基线和样例视频闭环

目标：用 1-3 个授权样例视频验证上传、姿态、球路、证据包、报告、记忆是否形成可复测闭环。

交付物：

- `data/sample_manifest.json` 或等价样例清单。
- browser-playable synthetic sample。最小版本已完成，`scripts/generate-synthetic-sample.swift` 可重建 `data/synthetic_ball.mp4`。
- 一份样例验收记录。最小版本已完成，见 `docs/PHASE1_SMOKE_REPORT.md`。
- 页面授权样例入口。最小版本已完成，`scripts/phase1-sample-ui-smoke.mjs` 可验证 `/api/samples`、视频 range 和 `sample_id` 分析路径。
- 授权 Alpha 本地流程入口。最小版本已完成，`scripts/authorized-alpha-analysis-smoke.mjs` 可验证当前本地上传、授权记录 ID、禁止用途、本地分析、`authorized_alpha_analysis.v1`、低置信证据包、报告合同、`short_term_review` 保存和隐私清单覆盖；它不读取真实校队视频，也不证明真实球员诊断质量。
- 本地 check 命令可重复运行。
- evidence packet、报告和 SQLite 写入截图或 JSON 记录。

验收：

- `server/index.mjs --check` 通过。
- 至少一个样例完成上传、分析、报告和 session 保存。
- Alpha 授权入口必须拒绝缺失授权记录 ID 的请求，并在有效授权时强制 `review_only`、`not_for_player_diagnosis`、`short_term_review_only` 和 no cloud/no public/no training 边界。
- 页面可加载授权 synthetic sample，并自动使用 `short_term_review`，避免写入长期个人记忆。
- 移动布局基线通过 `scripts/mobile-layout-smoke.mjs`：900px 以下单列，560px 以下 keyframes 单列。
- headless Chrome 390x844 移动浏览器基线通过 `scripts/mobile-browser-smoke.mjs`：无横向溢出、无浏览器 error。
- 低置信原因能显示在前端。

## Phase 2: 报告合同落地到前端

目标：把球员版和实验室版报告真正分开展示。

交付物：

- `player_report.v1` 渲染。
- `lab_report.v1` 渲染。
- 报告字段校验。
- 前端切换或分区展示。

验收：

- 球员版只显示主问题、证据摘要、训练动作和下次拍摄要求。
- 实验室版显示 signals、metrics、rules、missing evidence、model status。
- 任一结论可追溯到证据引用。
- `scripts/phase2-report-ui-browser-smoke.mjs` 通过：浏览器 DOM 中可见球员版/实验室版分区、`player_report.v1`、`lab_report.v1`、`missing_evidence`、模型状态和 adapter fallback，并清理 smoke 产生的 session。

## Phase 3: 球轨迹模块独立化

目标：把 YOLO adapter 的球路结果独立成 Ball Trajectory Card，并建立失败降级。

交付物：

- `ball_trajectory.v1` 数据结构。当前已抽到 `server/ballTrajectory.mjs`，并带 `source_contract`、`interpretation_policy`、`diagnosis_allowed=false` 边界。
- Ball Trajectory Card。
- 低置信和失败原因显示。
- 至少一个合成或授权样例验证。

验收：

- 缺球、缺筐、轨迹不连续、adapter error、不适合视角、低清/运动模糊、球被遮挡、篮筐出画、多个疑似篮球候选分别显示不同失败原因。
- 当前 YOLO 启发式不被展示为稳定能力。
- 报告只把球轨迹作为候选证据。
- `scripts/phase3-ball-trajectory-smoke.mjs` 从 `data/fixtures/phase3-ball-trajectory-adapter-fixtures.json` 回放 12 个 synthetic adapter fixture，并断言独立后端模块、`diagnosis_allowed=false`、前端低置信边界和重拍建议文案。
- `scripts/phase3-ball-trajectory-ui-smoke.mjs` 通过浏览器 DOM + canvas 验收：adapter error、不适合视角、球被遮挡、候选命中四类卡片文案可见，候选预览只在有轨迹点时显示，解释边界可见，并验证候选视频 overlay 在 canvas 上产生可见轨迹像素。

## Phase 4: 多角度输入

目标：支持同一次投篮的正面 + 侧面输入，并合并证据。

交付物：

- 多视频上传合同。后端已完成，前端最小入口已接入。
- session grouping。后端已完成 approximate grouping。
- front/side evidence merge。后端已完成 `multi_angle_evidence_packet.v1`。
- missing view 降级规则、同步评估、同步风险分解和 metadata-only 视角质量检查。后端已完成，`scripts/phase4-multi-angle-smoke.mjs` 可重复验证 source view、missing view、`sync_assessment.v1`、`view_quality_assessment.v1`、`risk_factors`、`retake_guidance` 和报告合同中的 `multi_angle_context`；前端已有最小证据审计 UI，`scripts/phase4-multi-angle-ui-smoke.mjs` 可在浏览器 DOM 中验证同步评估、同步风险、视角质量评估、视角证据、指标来源、缺失视角影响和 approximate sync 文案。

验收：

- 同一 session 可包含正面和侧面。
- 侧面支持时序，正面支持力线。
- 缺任一视角时报告明确降级。
- 报告合同保留 `multi_angle_context`、`not_frame_accurate` sync risk，并在 side-only 时优先请求缺失的 front 视角。
- 报告合同保留 `view_quality_assessment.v1`；single-angle 标记 `insufficient`，front+side metadata 满足合同时标记 `metadata_ready`。
- 页面可看到补充视角上传入口和 Multi Angle 摘要。
- smoke 验证 approximate grouping、`not_frame_accurate` 同步评估、metadata-only 视角质量评估、同步风险分解和浏览器可见审计 UI，不得写成精确跨机位同步或真实帧画质分析。

## Phase 5: 教练式动态画线

目标：在视频上叠加力线、角度线、发力链线，并随关键点移动。

交付物：

- 动态线层 renderer。最小版本已完成。
- 角度线：膝、髋、肘、躯干。最小版本已完成。
- 力线：脚膝髋、肩肘腕。最小版本已完成。
- 发力链线：下肢到上肢时序标记。最小版本已完成；已支持 evidence keyframe 阶段标签，仍待独立动作阶段分类器和分阶段诊断。
- 本地当前标注帧 PNG 导出和浏览器内最近标注帧预览。最小版本已完成；只合成当前视频帧和当前 overlay canvas，预览只保留在浏览器内存，不是带画线视频导出。
- Overlay Diagnostics 合同面板。最小版本已完成；显示 `coach_overlay_diagnostics.v1`、pose source、line count、evidence keyframe 阶段来源、candidate-only 球路 overlay、低置信 guard 和本地 PNG 导出边界，不代表真实样例可读性。
- 可重复源码契约 smoke：`scripts/phase5-dynamic-lines-smoke.mjs`。已完成；它不替代浏览器视觉验收或真实样例可读性验收。
- 可重复浏览器视觉 smoke：`scripts/phase5-browser-visual-smoke.mjs`。已完成；它用 synthetic keypoints 和 candidate trajectory 验证 canvas 像素、seek 阶段变化、教练线与候选球路同屏叠加、Overlay Diagnostics、本地 PNG 标注帧导出和浏览器内最近标注帧预览，不替代真实样例可读性或导出视频验收。

验收：

- 线条跟随视频 seek 和播放。
- 缺关键点时线条不显示，并说明原因。
- 不绘制静态假线。
- 页面加载无阻塞错误，MediaPipe 可用时初始化成功。
- 加载 evidence 后显示来自关键帧的最小阶段标签，并明确这不是独立阶段识别。
- 膝、髋、肘、躯干角度弧线来自当前帧关键点。
- Overlay Diagnostics 必须显示 overlay 来源、`phase_source=evidence_keyframes_not_classifier`、`candidate_only_not_stable_tracking`、`visibility<0.5 / score<0.2` guard 和 `local_browser_png_current_frame_no_video_export`。
- 源码契约 smoke 通过，且输出明确 `source_check_only_not_visual_browser_verification`。
- 浏览器视觉 smoke 通过，且输出明确 `browser_canvas_visual_check_synthetic_keypoints_and_candidate_trajectory`。

## Phase 6: 个人记忆系统产品化

目标：把本地 SQLite 记忆扩展成用户画像、历史问题、训练目标和趋势复测。

交付物：

- 本地用户档案。最小版本已完成。
- 历史问题列表。当前以长期记忆中的历史候选信号呈现。
- 训练目标和复测指标。最小版本已完成。
- 趋势图和低置信过滤。已有 long-term-only 趋势策略和 review 排除说明；`scripts/phase6-memory-smoke.mjs` 可重复验证短期复核不进入趋势，`scripts/phase6-memory-ui-smoke.mjs` 可在浏览器 DOM 中验证本地用户、主目标、趋势来源、训练目标和历史候选信号可见。

验收：

- 同一用户至少两次高置信 session 能形成趋势。
- 低置信 session 默认不影响长期趋势。
- smoke 验证 2 条 long-term 和 1 条 short_term_review 时，趋势只取 long-term。
- 前端记忆卡显示本地用户、主目标、趋势来源、训练目标、趋势图和历史候选信号；浏览器 UI smoke 必须验证这些字段可见。
- 用户可删除本地 SQLite session；当前不删除上传视频文件。

## Phase 7: 登录/云端/隐私方案

目标：在用户确认隐私和部署方向后，再设计登录、云端存储和跨设备同步。

交付物：

- 登录和权限方案。
- 云端存储方案。
- 数据删除和授权方案。本地隐私边界可见化、单条本地 session 删除、本地用户 SQLite sessions 批量删除、当前上传原始文件删除、受控历史上传文件逐个清理、保留期 dry-run/手动清理、本地 JSON 导出已完成，并有浏览器 UI smoke 验证隐私卡可见、隔离本地用户 session 删除和受控文件删除；授权撤回、云端导出和云端删除仍需设计。
- 真实校队视频处理流程。

验收：

- 明确服务商和数据区域。
- 明确视频是否上云和保存期限。
- 明确授权、撤回、删除和导出流程。
- 本地 JSON 导出不包含原始视频字节；云端导出/删除在确认云端方案后设计。
- 当前页面可见 local-only、local SQLite、cloud sync 未实现、默认禁止用途、本地 JSON 导出说明、本地用户 SQLite sessions 删除控件、受控上传文件删除和 dry-run 清理控件。

## 不阻塞但需确认

- iOS App、小程序、Web App 或 PWA。
- 是否使用当前本地 Web 原型作为正式路线。
- 样例视频授权来源。
- 接球/运球后投篮第一版支持深度。
- 是否导出带画线视频。
- 是否把评分纳入第一版。
