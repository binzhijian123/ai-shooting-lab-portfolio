# AI 投篮实验室作品集导览

这是一个面向 GitHub 展示的项目备份，保留源码、文档、知识库、RAG/向量检索资产、SFT/LoRA 数据与轻量 adapter 产物；排除了本地密钥、虚拟环境、上传视频、SQLite 私有会话、音频原文件和大体积基础模型权重。

## 一、项目入口

- `README.md`：项目主说明、运行方式、验收脚本和能力边界。
- `PRODUCT.md`、`Product-Spec.md`、`DEV-PLAN.md`：产品定位、阶段规划和交付说明。
- `docs/`：阶段 smoke、架构、RAG/LoRA、Arc Lab 平台化和交接文档。
- `app/`：本地分析实验室前端。
- `server/`：HTTP API、报告合同、RAG、记忆、模型 adapter 调度和隐私边界。
- `adapters/`：YOLO 与 RTMPose/MMPose 本地推理适配器。
- `scripts/`：验收、数据构建、RAG 查询、LoRA 训练/生成脚本。

## 二、大模型与检索资产

- `data/rag/vector_index.json`：向量检索索引，已包含在备份中。
- `data/rag/local_rag_index.json`：本地 sparse/hash RAG 索引。
- `data/rag/rag_eval_questions.json`：RAG 评估问题集。
- `data/finetune/`：SFT/LoRA 数据集、评估样本和轻量 adapter 输出。
- `distillation/douyin-shooting-coach/outputs/knowledge_base.json`：投篮知识库主产物。
- `obsidian/投篮规则知识图谱/`：从规则卡和知识库生成的 Obsidian 知识图谱。

更细的资产说明见 `MODEL_ASSETS.md`。

## 三、已排除内容

- `.env`：本地密钥和外部服务配置，只保留 `.env.example`。
- `.venv-*`、`node_modules/`、`.next/`：可重建环境和构建缓存。
- `data/uploads/`、`data/shooting_lab.sqlite`、`data/sessions.json`：本地上传视频和个人会话数据。
- `distillation/douyin-shooting-coach/outputs/audio/`：公开视频提取音频原文件。
- `*.pt`、`*.onnx`、`*.engine`、`weights/`：大体积基础模型权重。
- `测试用例/`：本地授权测试视频，不适合公开分发。
- `app/assets/poster/`：第三方球员参考图和衍生素材，公开仓库中排除以降低版权风险。
- `distillation/douyin-shooting-coach/.local-bin/`：本机可执行依赖，可按环境重装。

## 四、推荐 GitHub 展示路径

1. 先读 `README.md` 了解系统主链路。
2. 再读 `docs/RAG_FINE_TUNE_PORTFOLIO.md` 了解 RAG + LoRA 作品集叙事。
3. 用 `MODEL_ASSETS.md` 定位向量库、知识库、训练数据和 adapter。
4. 运行 `node server/index.mjs --check` 或 `node scripts/rag-finetune-smoke.mjs` 做轻量验收。

## 五、边界说明

这个备份是作品集展示版，不包含生产密钥、私有视频、真实云端部署凭据或大体积基础模型权重。YOLO/RTMPose/LoRA 能力需要按 `README.md` 和相关脚本在本机补齐依赖与权重后运行。
