# RAG + LoRA 小模型作品集链路

本链路用于展示 AI 投篮实验室不依赖外部大模型 API 的本地 RAG 与小模型行为微调能力。

## 目标

```text
knowledge_base.json
-> 本地 RAG 索引
-> query top-k 知识卡
-> LoRA/SFT 微调小模型
-> JSON 教练回答
-> cited_slugs 引用校验
```

RAG 负责找依据，LoRA 微调负责让小模型学习输出格式、教练语气、引用约束和拒答边界。

## 当前已验证

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-local-rag-index.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/local-rag-query.mjs "低位到高位起球怎么做？"
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-rag-finetune-dataset.mjs --max=240
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/rag-finetune-smoke.mjs
```

验证结果：

- RAG index: 173 个可用知识 chunk。
- SFT dataset: 196 条 chat messages JSONL 样本。
- Split: train 168 / valid 13 / test 15。
- Smoke 覆盖：索引存在、query 能召回、回答引用来自检索上下文、训练样本 JSON 格式合法、拒答样本存在。

## 本地 LoRA 环境

已创建独立环境：

```bash
.venv-rag-finetune/bin/python -m mlx_lm lora --help
```

推荐首个作品集模型：

```text
mlx-community/Qwen2.5-0.5B-Instruct-4bit
```

选择原因：

- 体积小，适合今晚跑通 LoRA demo。
- Apple Silicon 上可用 MLX-LM 训练。
- 作品集里足够证明“小模型行为微调 + RAG 约束生成”能力。

## 训练

网络能访问 Hugging Face 后运行：

```bash
ITERS=60 scripts/train-rag-lora.sh
```

快速冒烟：

```bash
ITERS=2 scripts/train-rag-lora.sh
```

训练产物默认写入：

```text
data/finetune/adapters/shooting-rag-json-lora
```

## 推理

训练完成后：

```bash
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

推理流程会先执行 RAG 检索，生成 `latest_prompt.txt`，再用 LoRA adapter 生成 JSON。

## DeepSeek Teacher 数据蒸馏

如果第一版模板训练集效果太机械，可以用 DeepSeek API 作为 teacher model 生成更自然的 RAG-grounded 标准答案。

安全边界：

- 不把 `DEEPSEEK_API_KEY` 写进代码、文档或提交记录。
- DeepSeek 只接收本地 RAG 检索出的知识卡，不接收原始视频、手机号或真实学生隐私。
- DeepSeek 返回后必须校验 JSON、`cited_slugs` 和 `boundary`，不合格样本写入 rejected，不进入训练集。

先把 key 放进当前 shell，或本地 `.env`。如果放 `.env`，确认 `.env` 不提交：

```bash
export DEEPSEEK_API_KEY="你的 key"
```

先小批量试跑：

```bash
node scripts/build-deepseek-teacher-dataset.mjs --count=10
node scripts/deepseek-teacher-dataset-smoke.mjs
```

确认 `data/finetune/shooting-rag-deepseek-teacher/dataset_summary.json`、`accepted_raw.jsonl` 和 `rejected_raw.jsonl` 后，再生成 100 条：

```bash
node scripts/build-deepseek-teacher-dataset.mjs --count=100
node scripts/deepseek-teacher-dataset-smoke.mjs
```

用 teacher 数据训练新 adapter：

```bash
MODEL="/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit" \
DATA_DIR="/Users/bzj/Documents/投篮实验室/data/finetune/shooting-rag-deepseek-teacher" \
ADAPTER_PATH="/Users/bzj/Documents/投篮实验室/data/finetune/adapters/shooting-rag-deepseek-teacher-v1" \
ITERS=200 \
scripts/train-rag-lora.sh
```

## 今晚实际阻塞

`ITERS=2 scripts/train-rag-lora.sh` 已通过本地索引、训练集和 smoke，但 Hugging Face 模型下载阶段连接超时：

```text
huggingface_hub.errors.LocalEntryNotFoundError
ConnectTimeout: [Errno 60] Operation timed out
```

这表示模型尚未下载到本地缓存，和 RAG/数据集/MLX-LM 命令本身无关。网络恢复后重复运行训练脚本即可。

## 简历表述

> 构建投篮训练领域 RAG + LoRA 小模型链路：将 200+ 条知识卡清洗为 173 个可检索 chunk，生成 196 条 RAG-grounded SFT 样本，使用 MLX-LM 对 Qwen2.5-0.5B-Instruct-4bit 进行 LoRA 行为微调，使本地模型在检索上下文约束下输出带引用、可校验、符合边界的 JSON 教练回答。

如尚未完成模型下载和 LoRA 训练，不要写“已完成微调部署”；可以写“完成 RAG 与 LoRA 数据/训练管线，并在本地 MLX 环境中准备微调”。完成一次训练后再改成已完成。
