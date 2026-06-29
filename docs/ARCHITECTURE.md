# AI 投篮实验室架构

## 优化后的项目提示词

构建一个 Evidence-based AI Shooting Coach。不要让大模型直接看视频自由猜测问题；大模型只接收结构化 evidence packet。完整链路是：本地视频上传、视觉模型提取关键点和球路、指标计算、Signal Registry 把指标变成可观察信号、投篮知识库匹配诊断规则和误判边界、DeepSeek 生成教练式 JSON 报告、本地记忆记录长期变化、最后输出个性化训练计划。

第一版必须完成可演示闭环：专业投篮实验室界面、视频工作台、真实 MediaPipe 关键点采样、YOLO adapter、RTMPose/MMPose adapter、关键指标、证据面板、DeepSeek/local fallback 报告、训练记忆、知识库摘要。模型不可用或置信度不足时必须明确降级，不允许用静态骨架或固定假检测冒充真实识别。

## 数据合同

```text
VideoContext
  -> MetricSeries
  -> ModelOutputs(MediaPipe | YOLO | RTMPose)
  -> MatchedSignal[]
  -> MatchedRule[]
  -> MissingEvidence[]
  -> EvidenceQuality
  -> CoachReport
  -> SessionMemory
```

## 关键原则

- 指标不是诊断；指标先变成 signal，再由知识库和误判条件共同判断。
- 论文指标只能作为候选证据；不同投篮距离、视角、帧率和个人基线会改变解释。
- DeepSeek 输出只负责表达、排序、解释和训练计划，不负责创造事实。
- 记忆系统记录的是长期趋势和有效训练，不自动写入未经验证的低置信结论。
- 后端必须先校验 DeepSeek JSON，再决定是否展示；校验失败使用本地 fallback。
- API key 只在后端环境变量或本地 `.env` 中读取，不进入前端 bundle、HTML 或 evidence packet。

## 当前落地架构

```text
app/
  本地视频预览
  MediaPipe PoseLandmarker canvas overlay
  分析前采样 pose_samples 并发送后端
  evidence packet 面板、关键帧 seek、角度曲线、记忆趋势

server/
  env.mjs             读取本地 .env
  uploadStore.mjs     保存本机上传视频，供模型 adapter 使用
  metricsEngine.mjs   从 MediaPipe 或 RTMPose keypoints 计算角度、时序、释放高度和重心漂移
  modelAdapters.mjs   调用 YOLO_COMMAND / RTMPOSE_COMMAND
  visionPipeline.mjs  生成 evidence_packet.v1，执行 Signal Registry、知识库规则匹配和证据降级
  promptPolicy.mjs    DeepSeek prompt、local fallback、CoachReport 校验
  memoryStore.mjs     SQLite 训练记忆和趋势摘要
  index.mjs           API 路由和 DeepSeek JSON 模式调用

adapters/
  yolo_adapter.py      Ultralytics YOLO 视频抽帧检测 person / sports ball，并输出作品集级投篮事件启发式
  rtmpose_adapter.py   MMPose Inferencer 视频姿态 adapter
```

## 后端安全与降级策略

- `/api/coach-report` 只接收结构化 evidence packet，不接收原始视频、base64 视频或完整转写。
- DeepSeek 请求使用 `response_format: { "type": "json_object" }`，prompt 明确要求 JSON。
- DeepSeek 返回必须通过 `validateCoachReport()`：证据来源、frame、rule_id、metric_id 和置信度上限都必须来自输入。
- 如果 evidence packet 缺视角、fps 低、signal 不可判断或置信度低，`deriveEvidenceQuality()` 会降低 `max_report_confidence`。
- SQLite 写入分两档：`long_term` 和 `short_term_review`。低置信或不可判断 session 不会自动进入长期记忆。

## 真实识别接入点

- 浏览器端 MediaPipe：已采样 landmarks 并由 `metricsEngine.mjs` 计算指标；采样失败时降级为 fallback contract。
- YOLO：已通过 `YOLO_COMMAND` adapter 接入 Ultralytics；本机 `.venv-models` 已安装并验证 adapter 可运行。通用 COCO 模型检测 person / sports ball，`YOLO_WORLD_MODEL=yolov8s-worldv2.pt` 作为 open-vocabulary rim/backboard detector；低置信或未检测到篮筐时仍降级。
- 投篮事件：YOLO adapter 基于 `chonyy/AI-basketball-analysis` 的球路/篮筐判定思路重写了 `shot_summary`、`shot_events` 和 `trajectory` 输出。它只作为可解释视觉信号进入 evidence packet；没有嵌入 OpenPose/TensorFlow 旧运行时。
- MMPose/RTMPose：已通过 `RTMPOSE_COMMAND` adapter 接入并验证可运行。adapter 会按需下载 OpenMMLab RTMPose-M 与 RTMDet person 权重，短视频按全帧输出 pose_series，长视频按均匀抽样输出；低置信结果会进入降级诊断。
- 指标层：优先使用 MediaPipe pose_samples；样本不足时使用 RTMPose/MMPose pose_series；两者都不足时才使用 fallback contract。
- 知识库层：Signal Registry 先生成 candidate signals，再根据 `knowledge_base.json` 的 cards、tags、diagnosis_rules、repair_actions、false_positives 生成 matched_rules。规则仍是候选诊断，不会绕过 required view 与 confidence 降级。
- SQLite：已落地为 `data/shooting_lab.sqlite`；后续可扩展 `signal_observations` 和 `user_signal_baselines` 表。

## 模型环境

- YOLO 环境：`.venv-models/bin/python adapters/yolo_adapter.py`，使用 Ultralytics `yolo11n.pt` 和可选 `yolov8s-worldv2.pt`。`YOLO_SAMPLE_FRAMES` 控制抽帧数量，默认 16。
- RTMPose 推荐环境：运行 `scripts/setup-rtmpose.sh` 创建仓库内 `.venv-mmpose`；当前本机已验证环境为 `/Users/bzj/miniforge3/envs/.venv-mmpose/bin/python adapters/rtmpose_adapter.py`。`RTMPOSE_FRAME_MODE=auto`、`RTMPOSE_MAX_FRAMES=180`、`RTMPOSE_UNIFORM_FRAMES=48` 控制逐帧和抽样策略。
- RTMPose 版本边界：`torch 2.12.0`、`mmengine 0.10.7`、`mmcv 2.1.0`、`mmdet 3.3.0`、`mmpose 1.3.2`。`mmdet 3.3.x` 要求 `mmcv < 2.2.0`。
