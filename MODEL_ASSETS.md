# 大模型、RAG 与向量数据库资产说明

## 已包含

| 资产 | 路径 | 用途 |
| --- | --- | --- |
| 向量数据库 | `data/rag/vector_index.json` | 投篮知识库的向量检索索引，供 vector RAG 查询和评估使用。 |
| 本地 RAG 索引 | `data/rag/local_rag_index.json` | sparse/hash 检索 demo，用于无外部向量服务的本地作品集演示。 |
| RAG 评估问题 | `data/rag/rag_eval_questions.json` | 固定检索评估问题。 |
| LoRA/SFT 数据集 | `data/finetune/**/{train,valid,test}.jsonl` | 由知识库和 RAG 生成的监督微调样本。 |
| 轻量 LoRA adapter | `data/finetune/adapters/**/adapters.safetensors` | 作品集展示用 adapter 产物；不是基础模型权重。 |
| adapter 配置 | `data/finetune/adapters/**/adapter_config.json` | 与 adapter 产物配套的训练配置。 |
| 评估集与结果 | `data/eval/` | RAG/LoRA 评估输入与结果。 |
| 知识库主产物 | `distillation/douyin-shooting-coach/outputs/knowledge_base.json` | 从公开投篮教学内容蒸馏出的结构化知识库。 |
| 规则图谱 | `obsidian/投篮规则知识图谱/` | 将规则卡、信号、发力链、肌群和训练动作连接为可浏览知识图谱。 |

## 未包含

| 资产 | 原因 | 本地恢复方式 |
| --- | --- | --- |
| DeepSeek API Key | 密钥不能公开提交。 | 复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY`。 |
| YOLO / YOLO-World `.pt` 权重 | 文件大，且模型权重应通过官方来源下载。 | 参考 `.env.example` 中 `YOLO_MODEL`、`YOLO_WORLD_MODEL` 配置。 |
| CLIP / MMPose / RTMPose 权重 | 文件大，可重建。 | 按 `scripts/setup-rtmpose.sh` 和 adapter 文档配置。 |
| Hugging Face 基础小模型 | 文件大，不适合直接放入 GitHub。 | 按 `docs/RAG_LORA_CONVERSATION_HANDOFF_2026-06-28.md` 下载到本机模型目录。 |
| 本地上传视频与 SQLite 会话 | 包含隐私数据和本机运行状态。 | 用 `data/sample_manifest.json` 与 `data/synthetic_ball.mp4` 做公开演示样例。 |
| 蒸馏音频原文件 | 来源与分发边界复杂，不适合公开仓库。 | 保留脚本与日志，必要时在本机重新抽取。 |
| 本机 ffmpeg 可执行文件 | 平台相关二进制依赖，不适合提交。 | 由 `imageio-ffmpeg`、系统包管理器或本地虚拟环境重新安装。 |

## 常用命令

```bash
node scripts/build-vector-rag-index.mjs
node scripts/vector-rag-query.mjs "低位到高位起球怎么做？"
node scripts/evaluate-vector-rag-retrieval.mjs
node scripts/build-rag-finetune-dataset.mjs --max=240
node scripts/rag-finetune-smoke.mjs
ITERS=60 scripts/train-rag-lora.sh
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

## 公开仓库注意事项

- `data/rag/vector_index.json` 已通过本备份的 `.gitignore` 白名单允许提交。
- `data/finetune/adapters/**/adapters.safetensors` 体积较小，作为 LoRA 作品集证据保留。
- 如果后续 adapter 或向量库超过 GitHub 单文件限制，建议改用 Git LFS 或 release asset。
- 不要把 `.env`、真实训练视频、上传目录或本地 SQLite 会话提交到公开仓库。
