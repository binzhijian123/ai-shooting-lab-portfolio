# AI 投篮实验室

Evidence-based AI Shooting Coach prototype.

核心链路：

```text
本地视频
-> 快速姿态层（浏览器 MediaPipe PoseLandmarker）
-> 高精度层（YOLO + MMPose/RTMPose adapter）
-> 指标层
-> Signal Registry
-> knowledge_base.json 规则匹配
-> DeepSeek 结构化教练报告
-> 本地训练记忆
-> 个性化训练计划
```

## 运行

```bash
node server/index.mjs
```

如果当前 shell 没有 `node`，在 Codex 本地环境可用：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.mjs
```

打开：

```text
http://localhost:4173
```

## 本地验收

基础检查：

```bash
node server/index.mjs --check
```

身体角度到知识库问题映射可单独校验。第一条命令验证8个角度定义、22个观察信号、13类问题映射及203张知识卡的检索覆盖；第二条验证单角度门控、缺视角门控、重复模式和人工复核门控：

```bash
node scripts/validate-body-angle-problem-mapping.mjs
node scripts/angle-knowledge-retrieval-smoke.mjs
node scripts/angle-knowledge-api-smoke.mjs
```

完整本地 MVP 验收会顺序运行 `--check`、关键 JS 语法检查、产品承诺边界扫描、移动端基线和 Phase 1-7 smoke。它只使用 synthetic 或 manifest 授权样例，不读取真实校队视频，也不把外部 API 或本机重模型作为硬依赖：

```bash
node scripts/mvp-acceptance-smoke.mjs
```

边界扫描可单独运行，用来防止文档或 UI 把登录/云端、稳定球轨迹、最终评分公式、真实校队视频默认用途写成已完成能力：

```bash
node scripts/boundary-claims-smoke.mjs
```

样例 manifest smoke 会验证本地样例只包含授权 synthetic sample、允许用途包含本地分析/验收、禁止公开展示/外部分发/云端保存/训练模型，并保持 not-for-player-diagnosis 边界：

```bash
node scripts/sample-manifest-smoke.mjs
```

Phase 1 样例闭环 smoke 会临时启动本地 server，上传 `data/sample_manifest.json` 中的 synthetic sample，生成 evidence/report，写入短期 session，再删除测试 session 和上传文件：

```bash
node scripts/phase1-sample-smoke.mjs
```

Phase 1 样例 UI smoke 会验证 `/api/samples`、授权样例视频流、无上传样例分析路径、报告合同和前端“加载授权样例”绑定；它不代表真实球员诊断质量：

```bash
node scripts/phase1-sample-ui-smoke.mjs
```

需要重建 synthetic sample 时：

```bash
swift scripts/generate-synthetic-sample.swift data/synthetic_ball.mp4
```

Phase 2 报告合同 smoke 会验证 legacy `report`、`player_report.v1`、`lab_report.v1`、引用追溯和前端报告分区绑定：

```bash
node scripts/phase2-report-contract-smoke.mjs
```

如果当前 shell 没有 `node`，可使用 Codex bundled Node：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/phase1-sample-smoke.mjs
```

Phase 3 球轨迹合同 smoke 使用 synthetic adapter fixtures 覆盖 `not_available`、`insufficient_evidence`、`candidate` 和 `tracked` 结构化状态；前端不再展示空中球路卡片或候选球路 overlay，只验证 `release_motion.v1` 人体姿态切片边界。它不代表真实视频稳定 2D 球轨迹能力：

```bash
node scripts/phase3-ball-trajectory-smoke.mjs
```

Phase 4 多角度合同 smoke 会临时启动本地 server，上传 synthetic sample 两次模拟 front/side，验证 present/missing views、source_view/source_views 和 approximate grouping 合同；它不代表精确跨机位同步：

```bash
node scripts/phase4-multi-angle-smoke.mjs
```

Phase 5 动态画线源码契约 smoke 会检查前端是否把 MediaPipe 当前帧 landmarks、RTMPose 当前帧 keypoints、教练线、角度弧线和 evidence keyframe 阶段标签绑定起来；它不代表浏览器视觉验收、真实样例可读性验收或独立动作阶段分类器：

```bash
node scripts/phase5-dynamic-lines-smoke.mjs
```

Phase 6 记忆系统 smoke 会创建独立测试用户的 2 条长期 session 和 1 条短期复核 session，验证趋势只来自长期记忆，并在结束前删除测试 session：

```bash
node scripts/phase6-memory-smoke.mjs
```

Phase 7 隐私边界 smoke 会验证 local-only policy、本地 JSON 导出、当前上传删除、受控历史上传删除和 retention cleanup dry-run/执行；它不实现登录、云端同步或授权撤回：

```bash
node scripts/phase7-privacy-smoke.mjs
```

## DeepSeek

服务端只读取环境变量，不会把 API key 放到前端。

```bash
export DEEPSEEK_API_KEY="你的 key"
export DEEPSEEK_MODEL="deepseek-v4-flash"
node server/index.mjs
```

也可以在本地创建 `.env`，服务端启动时会自动读取；`.env` 已在 `.gitignore` 中，不应提交。

没有配置 `DEEPSEEK_API_KEY` 时，系统会走本地 mock report，便于作品集演示。

## 本地 RAG + LoRA 微调作品集链路

本仓库包含一个可复现的本地 RAG 与小模型微调 demo 链路，用于展示不只依赖外部大模型 API：

```bash
node scripts/build-local-rag-index.mjs
node scripts/local-rag-query.mjs "低位到高位起球怎么做？"
node scripts/build-rag-finetune-dataset.mjs --max=240
node scripts/rag-finetune-smoke.mjs
ITERS=60 scripts/train-rag-lora.sh
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

当前链路把 `knowledge_base.json` 清洗为本地可检索 chunk，生成 RAG-grounded SFT 样本，并用 MLX-LM 对小模型做 LoRA 行为微调。详见 `docs/RAG_FINE_TUNE_PORTFOLIO.md`。

## 当前能力

- 本地上传视频并进入专业分析工作台。
- 生成结构化 `evidence_packet.v1`，包含指标、Signal Registry 候选信号、知识库规则、缺失证据、证据质量和个性化复测计划。
- 浏览器端会尝试加载 MediaPipe PoseLandmarker 作为快速骨架层；分析时会采集关键帧 landmarks 发给后端计算膝角、肘角、躯干前倾和释放高度。不可用时明确降级为 fallback contract。
- 从 `distillation/douyin-shooting-coach/outputs/knowledge_base.json` 读取知识库摘要。
- 使用 Signal Registry 映射指标到可观察信号。
- 使用 `body_angle_problem_mapping.v1` 把身体角度/曲线观察组合成候选问题，再以显式检索词、标签和证据门控查询知识库；单角度、缺视角或未经复核的结果不会直接成为确认诊断。
- YOLO / RTMPose(MMPose) 通过后端 adapter 接口接入；YOLO 已用 Ultralytics 本地环境验证可调用，RTMPose 已用 MMPose 本地环境验证可调用。
- YOLO adapter 已加入受 `chonyy/AI-basketball-analysis` 启发的投篮事件启发式：球过篮筐参考高度、是否落入篮筐水平范围、候选出手角和命中/未中摘要。实现已重写为当前 adapter 合同，没有嵌入 OpenPose/TensorFlow 旧运行时。
- 指标层会优先使用浏览器 MediaPipe 关键点；MediaPipe 不足时使用 RTMPose/MMPose pose_series；两者都不足时才进入 fallback contract。
- 调用 DeepSeek Chat Completions JSON 输出模式生成教练报告；后端会校验返回 JSON 的引用、置信度上限和复测指标，失败时回退本地报告。
- 保存训练 session 到本地 SQLite：`data/shooting_lab.sqlite`。
- 低置信或不可判断 session 只进入 `short_term_review`，不会自动写入长期记忆。

## 当前边界

- YOLO 使用通用 COCO 权重检测 person / sports ball；可选 YOLO-World open-vocabulary 权重检测 basketball hoop / rim / backboard。投篮专用球路仍需要后续专用模型或标定。
- 投篮命中/未中判断是作品集演示级启发式，依赖采样帧中同时出现篮球和篮筐；没有完整过筐序列时会降级为候选轨迹或缺失证据。
- RTMPose/MMPose 已能通过 adapter 运行，但低清、非人像或遮挡视频会返回低 pose confidence，并触发降级诊断。
- 手机竖屏视频会按真实 `videoWidth/videoHeight` 显示，姿态 overlay 只覆盖实际视频画面；不会再把 320x568 视频铺成横向宽屏。
- 如果浏览器无法加载 MediaPipe CDN，快速姿态层会降级为无骨架 fallback，只展示证据包和指标状态。
- 起球时序阈值是启发式 + 用户基线信号，不是论文给出的绝对标准。
- 身体角度没有统一“正确值”；当前基准按同球员同投篮场景、同类本地样本、同场景论文先验、工程暂定值依次降级，论文均值不直接作为错误线。
- 所有 AI 结论必须能追溯到 `signal_id`、`frame`、`rule_id`，否则后端会提示校验问题。

## 高精度模型 Adapter

不把模型权重绑定进项目。后端通过环境变量调用本机推理命令：

```bash
export YOLO_COMMAND="/path/to/yolo_adapter"
export RTMPOSE_COMMAND="/path/to/rtmpose_adapter"
```

两个命令都从 stdin 读取 JSON：

```json
{"video_path":"/path/to/upload.mp4","video_duration_ms":4200,"fps":60,"camera_view":"side"}
```

`YOLO_COMMAND` 返回：

```json
{"detections":{"ball":{"confidence":0.9},"rim":{"confidence":0.8},"person":{"confidence":0.95}},"ball_path_offset_cm":6,"shot_summary":{"attempts":1,"made":1,"missed":0},"shot_events":[]}
```

`RTMPOSE_COMMAND` 返回：

```json
{"confidence":0.92,"image_width":1920,"image_height":1080,"fps":60,"pose_series":[]}
```

当前前端会把视频保存到本机 `data/uploads`，只把本机路径交给 adapter；`evidence_packet` 和 DeepSeek 请求不会包含原始视频或服务器路径。

已验证的本机状态：

- `YOLO_COMMAND=.venv-models/bin/python adapters/yolo_adapter.py` 可运行，会使用 Ultralytics `yolo11n.pt`。
- `YOLO_WORLD_MODEL=yolov8s-worldv2.pt` 已接入为可选篮筐/rim open-vocabulary detector；合成测试视频没有真实篮筐时会返回 `confidence: 0` 并降级。
- `YOLO_SAMPLE_FRAMES=16` 控制每段视频抽帧数量。提高数值会让投篮事件更容易捕捉完整球路，但会增加推理时间。
- `RTMPOSE_FRAME_MODE=auto` 会对短视频尽量逐帧输出姿态；`RTMPOSE_MAX_FRAMES=180` 以内按全帧处理，超过后用 `RTMPOSE_UNIFORM_FRAMES=48` 均匀抽样。
- `RTMPOSE_COMMAND=/Users/bzj/miniforge3/envs/.venv-mmpose/bin/python adapters/rtmpose_adapter.py` 已验证可运行，会按需下载 OpenMMLab RTMPose-M 和 RTMDet person 权重。
- 合成测试视频不是人像，RTMPose 返回低置信关键点是预期结果；真实投篮视频应以 `precision_pose.confidence` 和 required view 共同决定是否允许诊断。

## RTMPose / MMPose 环境

推荐使用仓库脚本创建可复现环境：

```bash
scripts/setup-rtmpose.sh
```

脚本按当前已验证顺序安装：Python 3.10、`xtcocoapi` 源码 workaround、PyTorch、OpenMIM、MMEngine、`mmcv>=2.1,<2.2`、MMDetection 3.3、MMPose 1.3.2。

安装后使用：

```bash
export RTMPOSE_COMMAND="$PWD/.venv-mmpose/bin/python adapters/rtmpose_adapter.py"
export RTMPOSE_MODEL=human
export RTMPOSE_DEVICE=cpu
export RTMPOSE_FRAME_MODE=auto
export RTMPOSE_MAX_FRAMES=180
export RTMPOSE_UNIFORM_FRAMES=48
export MODEL_ADAPTER_TIMEOUT_MS=120000
```

## 第三方启发

投篮事件启发式参考了 [chonyy/AI-basketball-analysis](https://github.com/chonyy/AI-basketball-analysis) 的产品思路：检测篮球和篮筐，跟踪球路，并用篮筐水平范围估算命中/未中。该项目依赖 OpenPose 非商业研究许可；本项目仅用于作品集演示，并将相关逻辑重写到 YOLO adapter 中，不包含 OpenPose 运行时或其权重。

---

## RAG + LoRA 本地小模型问答系统

### 概述

本项目的另一个核心能力是**向量 RAG + LoRA 微调小模型**系统，作为作品集中"RAG + 微调"能力的展示。

```text
知识库（knowledge_base.json）
-> chunk 清洗
-> BAAI/bge-small-zh-v1.5 embedding 向量化
-> 本地 JSON 向量索引（data/rag/vector_index.json）
-> cosine similarity top-k 语义检索
-> Qwen2.5-0.5B-Instruct LoRA 微调模型推理
-> JSON 结构化输出（含引用、置信度、边界控制）
```

### 关键设计

| 组件 | 实现 |
|------|------|
| 向量 RAG | 本地 JSON 向量索引，512 维 BGE-small-zh embedding |
| Sparse RAG（对比） | local_rag_index.json，hash 检索 |
| 对比结果 | vector RAG hit@3 = 1.000，远超 sparse RAG |
| 训练数据 | DeepSeek teacher 生成 278 条 accepted + golden standard 20 条 |
| 边界样本 | 10 条拒答 + 11 条 knowledge_insufficient |
| 微调方式 | MLX LoRA，8 层，lr=3e-5，100-120 iters |
| 基础模型 | Qwen2.5-0.5B-Instruct-4bit |
| 输出格式 | JSON（answer / cited_slugs / confidence / boundary） |
| 边界控制 | personal_diagnosis_refusal / knowledge_insufficient / general_training_only |

### 使用方式

#### 启动 API 服务

```bash
node server/loraApiServer.mjs
```
或使用 Codex bundled Node：
```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/loraApiServer.mjs
```

服务运行在 `http://localhost:4175`。

#### 问答接口

```bash
curl -X POST http://localhost:4175/api/local-rag-coach \
  -H "Content-Type: application/json" \
  -d '{"question":"低位到高位起球怎么做？"}'
```

响应示例：

```json
{
  "ok": true,
  "schema_version": "local_rag_coach_response.v1",
  "question": "低位到高位起球怎么做？",
  "retrieval": {
    "method": "local_embedding_vector_rag_json_index",
    "top_k": 5,
    "matches": [
      { "slug": "kb-douyin_xxx", "score": 0.557, "title": "...", "summary": "..." }
    ]
  },
  "answer": {
    "answer": "低位到高位起球的核心是利用下肢力量向上传递...",
    "cited_slugs": ["kb-douyin_xxx"],
    "confidence": "high",
    "boundary": "general_training_only"
  },
  "model_source": "lora",
  "usage": { "prompt_tokens": 1672, "generation_tokens": 118 }
}
```

#### 运行评估

```bash
node scripts/run-eval.mjs
```

### 核心文件

```
data/
├── rag/
│   ├── local_rag_index.json        # Sparse RAG 索引
│   └── vector_index.json           # 向量 RAG 索引
├── finetune/
│   ├── golden-rag-standard-20/     # 20 条标准回答样例
│   ├── shooting-vector-rag-teacher-v1/  # 278 条 teacher 数据
│   ├── shooting-vector-rag-teacher-v1-augmented/  # 259 条增强数据
│   └── adapters/
│       ├── shooting-vector-rag-v1/         # 80 iters
│       ├── shooting-vector-rag-v1-120/     # 120 iters
│       └── shooting-vector-rag-augmented-v1/  # 100 iters + 边界样本
└── eval/
    ├── rag_lora_eval_set.json      # 固定 20 题评估集
    └── eval_results.json           # 评估结果

server/
├── localRagIndex.mjs               # Sparse RAG 引擎
├── vectorRagIndex.mjs              # 向量 RAG 引擎
├── goldenTeacherStandard.mjs       # Golden standard 校验
├── loraRagPipeline.py              # RAG + LoRA 管道（Python）
├── loraCoachApi.mjs                # LoRA 推理 Node 桥接
└── loraApiServer.mjs               # 独立 API 服务

scripts/
├── embed-texts.py                  # BGE embedding 模型调用
├── build-vector-rag-index.mjs      # 构建向量索引
├── vector-rag-query.mjs            # 向量检索 CLI
├── build-vector-teacher-dataset.mjs # DeepSeek teacher 数据生成
├── train-vector-lora.sh            # LoRA 训练
├── generate-vector-lora-answer.sh  # 端到端 CLI 推理
├── run-eval.mjs                    # 固定评估集验证
└── compare-rag-retrieval.mjs       # sparse vs vector 对比

docs/
├── NEXT_LLM_RAG_ROADMAP.md         # 完整路线图
└── RAG_RETRIEVAL_COMPARISON.md     # 检索对比报告
```

### 评估结果（20 题）

| 类别 | 通过率 |
|------|--------|
| 投篮技术问答（in-domain） | 14/14 ✅ |
| 个人诊断拒答 | 3/3 ✅ |
| 无关问题拒答 | 3/3 ✅ |
| **总计** | **20/20 (100%)** |

### 作品集表述建议

> 构建投篮训练领域向量 RAG + LoRA 蒸馏系统：使用 BAAI/bge-small-zh-v1.5 embedding 模型将结构化知识卡向量化并构建本地语义检索索引，对比 sparse 与 vector retrieval 的 hit@k 表现；再用 DeepSeek teacher 生成 278 条 RAG-grounded SFT 数据，对本地 Qwen2.5-0.5B 进行 LoRA 微调（MLX，8 层，100 iters），实现可引用、可校验、可拒答的本地教练问答，20 题评估集通过率 100%。
