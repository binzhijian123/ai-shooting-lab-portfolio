# Current System Audit

Updated: 2026-06-15

## 审计原则

本文件只盘点当前仓库能力。凡需要未来实现、真实样例验证、外部服务授权或云端部署的内容，均不得写成已完成事实。

## 目录职责与能力

| 目录 | 当前职责 | 真实能力 | 降级路径 | 不可承诺能力 |
| --- | --- | --- | --- | --- |
| `app/` | 本地 Web 工作台、移动端单列布局基线、授权样例入口、视频上传、MediaPipe 采样、骨架 overlay、教练线/角度弧线 overlay、报告、球轨迹卡和候选视频 overlay、多角度摘要/审计、记忆和隐私边界展示 | 可加载本地授权 synthetic sample 或本地上传视频，上传视频可保存到后端；900px 以下切换单列布局；尝试 MediaPipe PoseLandmarker；展示 evidence、球员版/实验室版报告、模型健康、Ball Trajectory Card、候选球轨迹视频 overlay、Multi Angle 摘要、视角证据清单、关键指标来源、视角缺失影响、最小动态教练线、角度弧线、evidence keyframe 阶段标签、记忆摘要和隐私边界卡；隐私卡可展示本地/云端边界、导出说明、受控上传文件列表、逐个删除按钮和保留期 dry-run/执行按钮；加载 synthetic sample 时自动切到 `short_term_review` | MediaPipe CDN 失败或无关键点时提示 fallback，不绘制静态假骨架或假线；球/筐不足时显示缺失证据；球轨迹点缺失时不绘制候选球路；多角度只显示 approximate grouping，不写成精确同步；隐私边界读取失败时提示不要上传真实校队视频；上传清理只处理受控文件名；synthetic sample 不用于真实球员诊断 | 不承诺移动 App 原生体验、真实手机文件选择体验、PWA/小程序封装，不承诺独立动作阶段分类器、导出画线视频、精确跨机位同步、高置信多角度诊断、登录或云端同步 |
| `server/` | HTTP API、静态文件服务、授权样例清单和视频流、上传保存、模型 adapter 调用、evidence packet、多角度合并、报告、SQLite 记忆 | `server/index.mjs --check` 可读取知识库；API 包含 knowledge summary、model health、sample list、sample video range streaming、upload、upload inventory/deletion、privacy export、analyze、multi-angle analyze、coach report、sessions、memory summary；memory summary 聚合本地画像、训练目标和历史候选信号；可删除本地 SQLite session | DeepSeek 未配置或校验失败时使用 local fallback；adapter 未配置时返回 `adapter_not_configured`；缺正/侧视角时写入 missing evidence；低置信 session 默认不进长期趋势；样例端点只读取 manifest 中授权样例；非受控文件名不会被上传文件清理 API 删除；隐私导出不包含原始视频字节 | 不承诺云端服务、账号登录、跨设备同步、生产级鉴权、授权撤回、云端导出或云端删除流程 |
| `adapters/` | YOLO 和 RTMPose/MMPose 本机模型 adapter | 从 stdin 接收 JSON，输出规范化 JSON；YOLO 检测 person/sports ball/rim 候选并给投篮事件启发式；RTMPose 输出 pose_series | 未配置、超时、依赖缺失或低置信时后端写入 missing evidence | 不承诺稳定球轨迹、稳定命中判断、稳定篮筐检测或所有视频可诊断 |
| `docs/` | 架构说明和数据合同 | `docs/ARCHITECTURE.md` 定义 evidence-based 链路、降级原则、API key 边界 | 文档明确模型不可用或置信度不足必须降级 | 不等于生产规格、隐私政策或最终产品路线 |
| `distillation/` | 公开创作者知识蒸馏管线和知识库 | `knowledge_base.json` 当前可读，`source_count=203`，规则卡 203，signal 9，诊断规则 551，修复动作 207 | 无合法转写或视频列表时应记录 `needs_transcript` 或 `needs_video_list` | 不承诺完整创作者覆盖，不上传 raw transcript/audio/video 到 GPT package |
| `obsidian/` | 规则知识图谱和可浏览索引 | 包含信号、发力链、肌群、训练、问题、规则卡和验收清单 | 节点复核时要求回链规则卡或转写路径，保留误判边界 | 不代表视觉模型已经能检测所有知识图谱节点 |
| `data/` | 本地运行数据、SQLite、上传视频和合成样例 | `data/shooting_lab.sqlite` 保存训练 session；`data/uploads/` 保存本机上传文件；存在 browser-playable `synthetic_ball.mp4`，基线为 640x360、30fps、2.4s | 低置信 session 写入 `short_term_review` 或由用户选择写入策略；synthetic sample 只用于本地验收 | 不承诺真实校队视频可公开展示、外部分发、云端保存或训练模型 |

## 当前后端 API

- `GET /api/knowledge-summary`：读取 `knowledge_base.json`，返回版本、规则卡数量、规则数量和 featured signals。
- `GET /api/pipeline-capabilities`：返回 MediaPipe、adapter、memory、coach 能力摘要。
- `GET /api/model-health`：运行 YOLO 和 RTMPose adapter health check。
- `GET /api/samples`：返回 manifest 中已授权的本地样例，不暴露绝对文件路径。
- `GET /api/sample-videos/:id`：按字节范围读取已授权本地样例视频，用于浏览器播放验收。
- `POST /api/upload-video`：保存 multipart 视频到本机，并尝试读取 metadata。
- `DELETE /api/uploads/:upload_id`：删除当前进程已登记的本地上传原始文件，仅限 `data/uploads/`。
- `GET /api/upload-files`：列出 `data/uploads/` 中受控上传文件。
- `DELETE /api/upload-files/:file_name`：按受控文件名删除历史本地上传文件，仅限 `data/uploads/`。
- `POST /api/upload-files/cleanup`：按保留天数 dry-run 预览或手动删除受控上传文件，仅限 `data/uploads/`。
- `POST /api/analyze-video`：合并上传或授权 sample、模型输出、记忆和知识库，生成 evidence packet。
- `POST /api/analyze-multi-angle`：合并同一 session 的 front/side 单角度 evidence，生成 `multi_angle_evidence_packet.v1`。
- `POST /api/coach-report`：校验 evidence packet，调用 DeepSeek 或 local fallback。
- `GET/POST /api/sessions`：读取或保存本地训练 session。
- `DELETE /api/sessions/:session_id`：删除本地 SQLite session，不删除上传视频文件。
- `GET /api/memory-summary`：读取本地 SQLite 趋势摘要。
- `GET /api/privacy-boundary`：读取本地隐私边界，声明 raw video、SQLite、cloud sync、禁止用途和授权要求。
- `GET /api/privacy-export`：导出本地 JSON，包含 SQLite session、记忆摘要和上传文件清单元数据，不包含原始视频字节。

## 真实能力

- 快速姿态层：浏览器端 MediaPipe `@mediapipe/tasks-vision@0.10.35` 可用时采样 landmarks，并在视频上绘制绿色骨架。
- 移动布局层：本地 Web 原型在 900px 以下进入单列 workspace，侧栏下沉，视频区域保持 16:9，560px 以下 keyframes 单列；`scripts/mobile-browser-smoke.mjs` 用 headless Chrome 390x844 验证无横向溢出和关键区域单列。
- 授权样例层：`/api/samples` 可列出 synthetic local acceptance sample，`/api/sample-videos/synthetic_ball` 可浏览器播放；前端可一键加载样例并保持 `short_term_review`。
- 高精度姿态层：RTMPose/MMPose adapter 配置后可输出 `pose_series`，前端可绘制后端骨架。
- 教练线层：当前帧关键点足够时，前端绘制脚膝髋力线、肩肘腕线、辅助手线、躯干线、发力链线，以及膝、髋、肘、躯干角度弧线；加载 evidence 后可按最近 `metric_series` keyframe 显示最小阶段标签；关键点不足时不绘制假线；`scripts/phase5-browser-visual-smoke.mjs` 已用 synthetic keypoints 和 candidate trajectory 在 headless Chrome 中验证 canvas 非空、教练线颜色像素、候选球路像素、seek 后阶段变化、同屏叠加和低分关键点 guard。
- 球轨迹可视化层：`ball_trajectory.trajectory_points` 存在时，前端可在视频 canvas 上绘制候选球心点、连接线、篮筐参考框、release marker 和 rim-cross marker；点缺失时不绘制假轨迹；合同 smoke 覆盖 adapter 未配置、adapter 报错、缺球、缺筐、轨迹不连续、不适合视角、低清/运动模糊等失败原因；浏览器 UI smoke 已验证 adapter error、视角不适合和候选命中三类卡片文案、候选预览和 canvas 候选 overlay。
- 指标层：根据 MediaPipe 或 RTMPose 计算膝角、肘角、躯干前倾、释放高度、起球时序等；两者不足时进入 fallback contract。
- 规则层：Signal Registry 把指标变成候选信号，再匹配 knowledge base 规则。
- 报告层：DeepSeek 只接收 evidence packet，返回 JSON；后端校验引用和置信度，不合格时 fallback。
- 报告合同层：`/api/coach-report` 返回 legacy report，同时生成 `player_report.v1` 和 `lab_report.v1`；`scripts/phase2-report-ui-browser-smoke.mjs` 可在 headless Chrome 中验证页面实际显示球员版/实验室版分区、schema version、missing evidence 和模型状态。
- 多角度层：`/api/analyze-multi-angle` 使用 approximate session grouping 合并 front/side evidence，并保留 metric/signal/rule 的 source view。
- 多角度审计层：前端 Multi Angle 卡可展示每个视角的 metric/signal/missing 计数、关键指标来源、视角缺失影响和 approximate sync policy；Phase 4 UI smoke 已验证 front+side 与 side-only packet 的浏览器 DOM 可见性。
- 记忆层：SQLite 保存 session，并区分 `long_term` 与 `short_term_review`；`/api/memory-summary` 返回本地画像、训练目标、历史候选信号和 long-term-only 趋势策略；Phase 6 UI smoke 已验证隔离测试用户的记忆卡 DOM 可见性和测试 session 清理。
- 删除和导出层：支持删除本地 SQLite session、当前进程已登记的上传原始文件、按受控文件名逐个删除历史上传文件，并支持按保留期 dry-run/手动清理 `data/uploads/` 受控上传文件；本地 JSON 导出只包含 SQLite session、记忆摘要和上传清单元数据；Phase 7 UI smoke 已验证隐私卡里受控上传文件可逐个删除、dry-run 候选可见且不会删除文件；不承诺后台自动清理、授权撤回、云端导出或云端删除。
- 隐私边界层：`/api/privacy-boundary` 和前端隐私卡明确当前是 local-only，cloud sync 未实现，真实校队视频默认不得公开展示、外部分发、云端保存或训练模型；Phase 7 UI smoke 已在 390x844 浏览器中验证 local-only、local SQLite、cloud sync 未实现、默认禁止用途和导出不含原始视频字节说明可见。

## 降级路径

- 没有上传视频路径：YOLO/RTMPose 返回 `requires_server_video`。
- 未配置 adapter：返回 `adapter_not_configured`。
- adapter 报错或超时：返回 `adapter_error` 或 timeout，写入 missing evidence。
- MediaPipe 不可用：前端显示不可用原因，后端使用 RTMPose 或 fallback。
- 球/筐检测不足：shot event 变成候选轨迹或缺失证据。
- DeepSeek 未配置、失败、返回非法 JSON 或引用非法证据：使用 local fallback 报告。
- 低置信 session：不应自动写入长期训练记忆。

## 不可承诺能力

- 当前没有稳定 2D 球轨迹独立模块。
- 当前没有独立动作阶段分类器、导出画线视频或经过真实样例验证的完整动态画线产品能力；Phase 5 浏览器视觉 smoke 只证明 synthetic keypoints 和 synthetic candidate trajectory 下的 canvas 绘制合同。
- 当前没有登录、账号、云端同步、组织权限或跨设备恢复。
- 当前没有最终评分公式。
- 当前没有真实校队视频授权、数据治理和云端保存方案。
- 当前不能保证接球投篮、运球后投篮达到可诊断级别。

## 发现的环境边界

当前 shell 中 `node` 和 `npm` 不在 PATH；README 记录的 bundled Node 路径存在：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

因此本机验收可使用：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.mjs --check
```
