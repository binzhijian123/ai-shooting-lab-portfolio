# Product Spec: MVP Phase 0.5

Updated: 2026-06-15

## 事实来源

- `README.md`
- `docs/ARCHITECTURE.md`
- `app/`, `server/`, `adapters/`
- `distillation/douyin-shooting-coach/outputs/knowledge_base.json`
- `distillation/douyin-shooting-coach/outputs/methodology/`
- `obsidian/投篮规则知识图谱/`

## 目标用户

第一版服务学校校队球员和协助复盘的教练。默认使用场景是移动端拍摄、上传或本地选择训练视频，然后获得可追溯的投篮动作诊断、证据说明、复测建议和训练动作。

当前实现形态是本地 Web 原型，不是已发布的移动 App、小程序或云端 SaaS。

## MVP 目标

MVP 的核心目标是形成可演示、可复测、可降级的投篮分析闭环：

1. 球员上传本地投篮视频。
2. 系统采集或调用姿态、球/筐检测和视频元数据。
3. 指标层生成 `evidence_packet.v1`。
4. Signal Registry 和 `knowledge_base.json` 匹配候选信号与规则。
5. DeepSeek 或本地 fallback 生成结构化报告。
6. 结果写入本地 SQLite 训练记忆。
7. 球员按复测要求再次录制，比较趋势。

## 非目标

- 第一版不承诺登录、账号体系、云端同步或跨设备数据迁移。
- 第一版不承诺稳定 2D 球轨迹、稳定命中/未中判断或稳定篮筐检测。
- 第一版不承诺自动修关键点、手动点球、手动选关键帧作为普通球员主流程。
- 第一版不承诺最终评分公式或论文级评分标准。
- 第一版不公开展示、外部分发、云端保存或训练真实校队视频，除非用户明确授权并另行制定数据流程。
- 第一版不把 DeepSeek、付费 API、外部云服务作为硬依赖；无 API key 时必须可本地 fallback。

## 用户流程

1. 球员选择本地授权样例，或上传本地视频。
2. 页面显示真实视频预览，MediaPipe 可用时显示骨架 overlay；不可用时提示降级。
3. 球员选择视角、惯用手、训练目标和记忆写入策略。
4. 如果是上传视频，系统保存本机上传文件到 `data/uploads/`，并尝试读取视频元数据；如果是授权样例，系统只按 `sample_id` 读取 manifest 中允许本地验收的样例。
5. 浏览器尝试采集 MediaPipe pose samples，后端并行调用 YOLO 和 RTMPose/MMPose adapter。
6. 后端生成 evidence packet，包含指标、模型状态、候选信号、匹配规则、缺失证据和置信度上限。
7. 报告层只使用 evidence packet，不接收原始视频、base64 视频、服务器路径或完整转写。
8. 前端展示指标、证据、报告、缺失证据、模型健康状态和记忆趋势。
9. 球员按 follow-up 要求补拍正面、侧面或更高帧率视频。

## 功能清单

| 功能 | 状态 | 依据 | 验收方式 |
| --- | --- | --- | --- |
| 本地 Web 原型入口 `node server/index.mjs` | 已完成 | `README.md`, `server/index.mjs` | 打开 `http://localhost:4173` |
| `--check` 读取知识库 | 已完成 | `server/index.mjs` | `node server/index.mjs --check` |
| 移动端 Web 布局基线 | 部分完成 | `app/styles.css`、`scripts/mobile-layout-smoke.mjs`、`scripts/mobile-browser-smoke.mjs`；900px 以下单列，headless Chrome 390x844 无横向溢出，560px 以下 keyframes 单列 | mobile layout smoke + mobile browser smoke |
| 本地授权样例入口 | 部分完成 | `/api/samples`、`/api/sample-videos/:id`、`app/main.js`；当前只有 synthetic sample，不是真实球员视频 | Phase 1 sample UI smoke |
| 本地上传并保存到 `data/uploads/` | 已完成 | `app/main.js`, `server/uploadStore.mjs` | 上传视频后返回 `upload_id` |
| 授权 Alpha 本地流程入口 | 部分完成 | `POST /api/authorized-alpha-analysis`、`server/alphaTestPolicy.mjs`、前端 Alpha 授权测试卡片；要求当前本地上传、授权记录 ID、本地分析/本地验收授权和禁止公开/外发/云端/训练用途；强制 `short_term_review`、`review_only`、`not_for_player_diagnosis` | authorized alpha analysis smoke |
| 上传原始文件删除 | 部分完成 | `DELETE /api/uploads/:upload_id`、`GET /api/upload-files`、`DELETE /api/upload-files/:file_name` 和前端删除按钮；Phase 7 UI smoke 已验证受控上传文件可在隐私卡中逐个删除；仅覆盖受控本地上传文件 | Phase 7 upload delete smoke + UI smoke |
| 上传文件保留期清理 | 部分完成 | `POST /api/upload-files/cleanup` 支持 dry-run 预览和手动执行；Phase 7 UI smoke 已验证 dry-run 候选可见且不删除文件；不是后台自动清理 | Phase 7 cleanup smoke + UI smoke |
| 本地数据导出 | 部分完成 | `GET /api/privacy-export` 和前端 JSON 下载按钮；支持按本地 `user_id` 导出；Phase 7 UI smoke 已验证页面可见导出按钮和“不包含原始视频字节”说明；导出 SQLite session、记忆摘要和上传清单元数据，不导出原始视频字节 | Phase 7 export smoke + UI smoke |
| 浏览器 MediaPipe 快速姿态层 | 部分完成 | `app/main.js` | CDN 可用且有人体时显示骨架；失败时降级 |
| RTMPose/MMPose adapter | 部分完成 | `adapters/rtmpose_adapter.py`, `server/modelAdapters.mjs` | adapter 配置后 health check 和 pose_series 可用 |
| YOLO adapter | 部分完成 | `adapters/yolo_adapter.py` | adapter 配置后返回 person/ball/rim 候选检测 |
| 球路和命中启发式 | 部分完成 | `adapters/yolo_adapter.py`, `server/ballTrajectory.mjs`, `server/visionPipeline.mjs`, `app/main.js`；前端已有 Ball Trajectory Card 和候选视频 overlay 绑定；Phase 3 smoke 用 12 个 synthetic fixture 覆盖失败原因、候选状态和 `diagnosis_allowed=false` 边界，Phase 3 UI smoke 已验证浏览器 DOM 里失败原因、重拍建议、候选预览、解释边界和 canvas 候选 overlay 可见 | 只能作为候选轨迹或缺失证据，不写成稳定能力 |
| evidence packet v1 | 已完成 | `server/visionPipeline.mjs` | 返回 `schema_version=evidence_packet.v1` |
| DeepSeek JSON 报告 | 部分完成 | `server/promptPolicy.mjs` | API key 可用时调用；失败或未配置时 fallback |
| 本地 SQLite 训练记忆 | 已完成 | `server/memoryStore.mjs` | `data/shooting_lab.sqlite` 存在并可读写 session |
| 本地用户画像和趋势复测摘要 | 部分完成 | `server/memoryStore.mjs`, `app/main.js`；Phase 6 UI smoke 已验证浏览器 DOM 中的本地用户、主目标、趋势来源、训练目标、历史候选信号和趋势柱 | Phase 6 smoke + UI smoke |
| 本地 session 删除 | 部分完成 | `DELETE /api/sessions/:session_id`、`DELETE /api/users/:user_id/sessions`、前端最近记录删除按钮和隐私卡本地用户 session 批量删除控件；只删除本地 SQLite session，不删除上传视频文件 | Phase 6 delete smoke + Phase 7 privacy smoke + UI smoke |
| 球员版报告与实验室版报告分离展示 | 部分完成 | 后端返回 `player_report.v1` / `lab_report.v1`，前端已有分区展示和 `Evidence Trace` 追溯面板；`scripts/phase2-report-ui-browser-smoke.mjs` 已验证浏览器 DOM 可见分区、schema、trace 字段、missing evidence 和模型状态；仍需 UX polish 和真实样例复核 | Phase 2 contract smoke + UI browser smoke |
| 多角度 front + side 合并 evidence | 部分完成 | 后端返回 `multi_angle_evidence_packet.v1`，`/api/coach-report` 已可消费 multi-angle packet 并在 lab report 保留 `multi_angle_context`、`sync_assessment.v1`、`view_quality_assessment.v1`、sync risk evidence 和视角质量降级原因；前端已有补充视角入口、合并摘要、视角/指标来源审计 UI、metadata-only 视角质量评估、同步风险分解和重拍建议；仍未做精确跨机位同步或真实帧画质分析 | Phase 4 smoke |
| 动态力线、角度线、发力链线 overlay | 部分完成 | 已有基于当前帧关键点的脚膝髋、肩肘腕、辅助手、躯干、发力链线和膝/髋/肘/躯干角度弧线；已可基于 evidence keyframes 显示最小阶段标签；已有 `coach_overlay_diagnostics.v1` 面板解释 pose source、line count、阶段来源、candidate-only 球路 overlay、低置信 guard 和本地 PNG 导出边界；浏览器 visual smoke 已用 synthetic keypoints 和 candidate trajectory 验证 canvas 绘制、同屏叠加、Overlay Diagnostics、本地当前标注帧 PNG 导出和浏览器内最近 3 张标注帧预览；真实样例校验仍待完成，带画线视频导出未实现 | Phase 5 source smoke + browser visual smoke |
| 登录、账号、云端同步 | 后续开发 | 当前只有本地 SQLite | Phase 7 验收 |
| 本地隐私边界可见化 | 部分完成 | `/api/privacy-boundary` 和前端隐私卡展示本地/云端/禁用用途；Phase 7 UI smoke 已在 390x844 浏览器中验证 local-only、local SQLite、cloud sync 未实现和默认禁止用途可见 | Phase 7 privacy smoke + UI smoke |
| 评分公式 | 待确认 | 当前无最终公式 | 先做研究计划，不写入 MVP 事实 |

## 已完成

- 本地 Web 原型和静态前端工作台。
- `knowledge_base.json` 读取和知识摘要 API。
- `evidence_packet.v1` 生成。
- 本地授权 synthetic sample 可浏览器播放，并可通过 `sample_id` 走低置信验收闭环。
- 授权 Alpha 本地流程入口可复用当前本地上传，要求明确本地授权，返回 `authorized_alpha_analysis.v1`，并强制低置信、短期记忆和禁止用途边界；该入口不证明真实球员诊断质量。
- MediaPipe 采样路径和骨架 overlay。
- YOLO / RTMPose adapter 合同和健康检查路径。
- DeepSeek JSON mode 与本地 fallback 报告。
- SQLite 本地训练记忆。

## 部分完成

- 姿态识别：依赖浏览器 MediaPipe CDN 或本地 RTMPose adapter 配置，低清、遮挡、无人像视频会降级。
- 球轨迹：已有独立 `server/ballTrajectory.mjs`、`ball_trajectory.v1` 字段、Ball Trajectory Card 和候选视频 overlay 绑定；Phase 3 smoke 已覆盖 adapter 未配置、adapter 报错、缺球、缺筐、轨迹不连续、不适合视角、低清/运动模糊、球被身体或手臂遮挡、篮筐出画、多个疑似篮球候选等失败原因，并要求 `source_contract`、`interpretation_policy` 和 `diagnosis_allowed=false`；Phase 3 UI smoke 已验证浏览器 DOM 中的失败原因、重拍建议、候选边界、候选预览和 canvas 候选 overlay；YOLO 当前仍是通用检测和启发式投篮事件，不是稳定 2D 球轨迹模块。
- 报告展示：后端有严格引用校验，前端已有球员版/实验室版分区；浏览器 DOM smoke 已验证 synthetic sample 下的可见分区、schema version、missing evidence 和模型状态；仍需真实样例验证可读性和移动端密度。
- 授权 Alpha 测试：已有本地-only 入口、授权字段校验、报告生成、`short_term_review` 保存和隐私清单覆盖；当前 smoke 仍使用 synthetic sample 代替真实球员视频，不代表真实视频诊断质量已通过。
- 移动端体验：本地 Web 已有单列移动布局基线和 smoke；仍未做真实手机文件选择、上传延迟、触控密度和 PWA/原生封装验收。
- 多角度输入：后端可合并 front/side evidence，报告合同已保留 `multi_angle_context`、sync risk 和 `view_quality_assessment.v1`，side-only 报告会优先请求缺失的 front 视角；前端已有同一 session 的补充视角入口、同步评估、同步风险、metadata-only 视角质量评估、视角证据清单、关键指标来源和视角缺失影响；Phase 4 UI smoke 已验证 front+side 与 side-only packet 可在浏览器 DOM 中显示 `risk_factors`、`retake_guidance`、`view_quality_front_side_metadata_ready` 和 `view_quality_missing_front`；当前只做 approximate grouping、`not_frame_accurate` 和 metadata/evidence-context 视角质量评估，不做手动关键帧同步、精确跨机位同步或真实帧画质分析。
- 动态画线：前端能基于 MediaPipe 或 RTMPose 当前帧关键点画最小教练线和角度弧线；当前可显示来自 `evidence.metric_series` 的最小阶段标签；Overlay Diagnostics 能解释当前 overlay 来源和边界；浏览器 visual smoke 已验证 synthetic keypoints 下的 canvas 像素、seek 阶段变化、候选球路同屏叠加、低分 guard、诊断面板、本地当前标注帧 PNG 导出和浏览器内存里的最近标注帧预览，但不是独立动作阶段分类器；仍没有真实样例高置信验收或导出画线视频。
- 记忆系统：已有本地 session、趋势摘要、本地用户画像、训练目标聚合、历史候选信号、趋势图 DOM 展示、单条 SQLite session 删除和按本地用户批量删除 SQLite sessions；Phase 6/7 UI smoke 已验证隔离测试用户的记忆卡可见性和本地 session 删除；仍不是账号体系或云端同步。
- 隐私删除和导出：当前可删除本进程登记的上传原始文件、列出/逐个删除受控本地上传文件、按保留期 dry-run/手动清理受控上传文件、删除单条或某个本地用户的 SQLite sessions，并导出本地 JSON 数据；这些删除都不等于授权撤回、云端导出/删除或原始视频导出。

## 待确认

- 最终客户端形态：iOS App、小程序、Web App 还是 PWA。
- 当前本地 Web 原型是否作为第一版正式技术路线。
- 是否需要账号登录作为 MVP 第一版硬要求。
- 是否允许使用真实校队视频做内部规则迭代。
- 样例视频来源、授权范围和保存期限。
- 接球投篮、运球后投篮第一版支持深度。
- 是否需要导出带画线视频作为正式交付。

## 后续开发

- Phase 1：授权样例视频闭环。
- Phase 2：报告合同落地到前端。
- Phase 3：球轨迹模块独立化。
- Phase 4：多角度输入。
- Phase 5：教练式动态画线。
- Phase 6：个人记忆系统产品化。
- Phase 7：登录、云端和隐私方案。

## 验收标准

- 普通球员完成一次上传、分析、报告、保存记忆和复测建议闭环。
- 报告中的诊断必须引用 `signal_id`、`metric_id`、`frame`、`rule_id` 或 `missing_evidence`。
- 低置信或缺证据时明确提示降级，不给高置信结论。
- 文档和 UI 不把登录、云端、稳定球轨迹、动态画线或评分公式写成已完成事实。
- 不要求普通球员手动修关键点、手动点球或手动选关键帧才能获得主流程结果。
