# RAG + LoRA 本次对话交接文档

日期：2026-06-28  
范围：仅覆盖本次对话中关于“作品集展示 RAG + 小模型 LoRA 微调能力”的工作，不覆盖项目其它历史任务。

## 用户目标

用户想把 AI 投篮实验室作为作品集，展示自己具备：

- 本地知识库/RAG 检索能力。
- 小模型微调能力。
- RAG + 微调组合能力。
- 能解释模型输出边界、引用校验、训练数据质量评估，而不是只调用外部 DeepSeek API。

用户明确表示自己是小白，需要边做边教，解释“在哪操作”“终端和 Python 的区别”“训练数据怎么看好坏”等基础概念。

## 当前结论

不要把目标描述为“微调小模型来检索数据库”。更专业的叙事是：

```text
RAG 负责从知识库找依据。
LoRA/SFT 微调负责让小模型学习回答格式、教练语气、引用约束和拒答边界。
```

推荐简历表达：

> 构建投篮训练领域 RAG + LoRA 微调管线：将知识卡清洗为可检索 chunk，生成 RAG-grounded SFT 样本，并使用本地小模型在检索上下文约束下输出带引用、可校验、符合边界的 JSON 教练回答。

注意：如果真实 LoRA 训练尚未完成，不要写“已完成微调部署”；可以写“已完成 RAG 与 LoRA 数据/训练管线，并准备在本地 MLX 环境中微调”。

## 已完成的代码/文件

新增：

- `server/localRagIndex.mjs`
  - 构建本地 sparse/hash TF-IDF 风格 RAG 索引。
  - 从 `knowledge_base.json` 清洗可用知识卡。
  - 支持 `retrieveLocalRag()` top-k 检索。
  - 支持 `buildGroundedPortfolioAnswer()` 生成带 `cited_slugs` 的模板回答。

- `scripts/build-local-rag-index.mjs`
  - 读取 `distillation/douyin-shooting-coach/outputs/knowledge_base.json`。
  - 生成 `data/rag/local_rag_index.json`。

- `scripts/local-rag-query.mjs`
  - 命令行测试 RAG 检索。
  - 示例：`node scripts/local-rag-query.mjs "低位到高位起球怎么做？"`

- `server/localFineTuneData.mjs`
  - 从 RAG 索引自动生成 SFT/LoRA chat messages 样本。
  - 样本目标是训练模型输出 JSON：`answer`、`cited_slugs`、`confidence`、`boundary`。
  - 包含个人诊断拒答负例。

- `scripts/build-rag-finetune-dataset.mjs`
  - 生成：
    - `data/finetune/shooting-rag-json/train.jsonl`
    - `data/finetune/shooting-rag-json/valid.jsonl`
    - `data/finetune/shooting-rag-json/test.jsonl`
    - `data/finetune/shooting-rag-json/dataset_summary.json`

- `scripts/rag-finetune-smoke.mjs`
  - 验证 RAG index、query、引用合法性、SFT JSON 格式、拒答样本。

- `scripts/prepare-rag-lora-prompt.mjs`
  - 先跑 RAG 检索，再生成与训练格式一致的 prompt。
  - 输出：
    - `data/finetune/shooting-rag-json/latest_prompt.txt`
    - `data/finetune/shooting-rag-json/latest_references.json`

- `scripts/train-rag-lora.sh`
  - 封装 MLX-LM LoRA 训练。
  - 默认模型：`mlx-community/Qwen2.5-0.5B-Instruct-4bit`
  - 默认 adapter 输出：`data/finetune/adapters/shooting-rag-json-lora`

- `scripts/generate-rag-lora-answer.sh`
  - 推理脚本。
  - 会先跑 RAG 检索，再调用 MLX-LM + adapter 生成回答。

- `docs/RAG_FINE_TUNE_PORTFOLIO.md`
  - 作品集说明、命令、当前状态、简历表述、阻塞记录。

修改：

- `package.json`
  - 增加：
    - `rag:build`
    - `rag:query`
    - `rag:dataset`
    - `rag:smoke`
    - `rag:lora:train`
    - `rag:lora:generate`

- `README.md`
  - 增加本地 RAG + LoRA 微调作品集链路说明。

记忆：

- `~/.codex/memories/ERRORS.md`
  - 记录了 Hugging Face 下载超时不是 MLX/数据问题。

## 已验证状态

已成功运行：

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-local-rag-index.mjs
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-rag-finetune-dataset.mjs --max=240
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/rag-finetune-smoke.mjs
```

最后一次 smoke 输出摘要：

```text
RAG index chunks: 173
RAG query matches: 5
cited_slugs:
  - kb-douyin_7311694235550371084
  - kb-douyin_6997613791248747806
SFT dataset:
  train: 168
  valid: 13
  test: 15
  total: 196
format: chat_messages_jsonl
checks: all passed
```

已成功安装 MLX-LM 环境：

```text
/Users/bzj/Documents/投篮实验室/.venv-rag-finetune
```

已验证：

```bash
.venv-rag-finetune/bin/python -m mlx_lm lora --help
```

## 当前未完成/阻塞

真实 LoRA 训练还没有确认完成。

原因：之前运行短训：

```bash
HF_HUB_DOWNLOAD_TIMEOUT=30 HF_HUB_ETAG_TIMEOUT=30 ITERS=2 scripts/train-rag-lora.sh
```

在加载：

```text
mlx-community/Qwen2.5-0.5B-Instruct-4bit
```

时 Hugging Face 连接超时：

```text
ConnectTimeout [Errno 60] Operation timed out
LocalEntryNotFoundError
```

这不是 RAG、训练数据或 MLX-LM 命令错误，而是模型还未完整下载到本地。

用户随后自己运行了：

```bash
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

日志显示：

```text
prepare_rag_lora_prompt_result.v1 ok
reference_slugs:
  - kb-douyin_7311694235550371084
  - kb-douyin_6997613791248747806
  - kb-douyin_7349396087804841279
Downloading ...
Fetching 9 files
```

解释：第 8 步推理也会加载模型。如果本地模型缓存不完整，它会自动下载 Hugging Face 模型文件。这是正常现象。

我暂时未知用户终端里的模型下载是否已经完成，因为那是在用户自己的终端中继续运行的。

## 用户需要的基础解释

用户是小白，需要用非常基础的方式解释：

- 大部分操作在 Mac Terminal 里做，不是在 Python 交互界面里手写。
- Python/Node/MLX 是被终端命令调用的工具。
- `cd /Users/bzj/Documents/投篮实验室` 是进入项目目录。
- `.venv-rag-finetune/bin/hf` 是项目里的 Hugging Face 下载工具。
- 相对路径 `.venv-rag-finetune/bin/hf` 只有在项目目录里才可用；如果用户当前不在项目目录，要用绝对路径：

```bash
/Users/bzj/Documents/投篮实验室/.venv-rag-finetune/bin/hf
```

曾经用户报错：

```text
zsh: no such file or directory: .venv-rag-finetune/bin/hf
```

原因是终端当前目录不在项目目录。已验证实际文件存在：

```text
/Users/bzj/Documents/投篮实验室/.venv-rag-finetune/bin/hf
```

## 下载模型命令

推荐让用户先下载 MLX 版 Qwen 小模型：

```bash
mkdir -p /Users/bzj/models/qwen-mlx

/Users/bzj/Documents/投篮实验室/.venv-rag-finetune/bin/hf download mlx-community/Qwen2.5-0.5B-Instruct-4bit \
  --local-dir /Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit
```

如果网络超时，重复运行同一条命令。通常会断点续传。

下载后训练：

```bash
cd /Users/bzj/Documents/投篮实验室

MODEL="/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit" \
ITERS=60 \
scripts/train-rag-lora.sh
```

训练后推理：

```bash
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

## 训练数据质量问题

用户提出一个重要问题：如果不判断训练数据好坏，只是全自动跑一遍，那还算不算“调”。

已解释：

```text
只自动生成数据并训练，只能叫跑通微调流程。
真正的微调是：
生成数据 -> 抽样评审 -> 训练 -> 测试输出 -> 改数据/改 prompt/改规则 -> 再训练。
```

需要看的目录：

```text
data/finetune/shooting-rag-json
```

重点文件：

- `dataset_summary.json`
  - 先看 `first_train_example`。
- `train.jsonl`
  - 真正训练集。
- `valid.jsonl`
  - 训练过程验证。
- `test.jsonl`
  - 训练后测试。

人工判断一条样本好坏时看：

- 用户问题像不像真实学生问题。
- RAG 知识卡是否相关。
- assistant 答案是否引用知识卡。
- `cited_slugs` 是否来自输入知识卡。
- 是否乱做个人视频诊断。
- 中文是否符合产品想要的教练语气。

当前 `rag-finetune-smoke.mjs` 只验证结构和引用，不验证主观质量。下一步可以补“人工评审表”和固定测试集。

## 建议下一步

优先级 1：确认模型是否下载完成。

可以检查：

```bash
ls -lah /Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit
```

如果用户没有用 `--local-dir` 下载，而是通过 `generate` 自动下载，则模型可能在 Hugging Face cache，不在 `/Users/bzj/models/...`。此时可直接重跑训练脚本，或继续用同一个 Hugging Face 模型名。

优先级 2：跑一次短训确认真实训练能开始。

```bash
cd /Users/bzj/Documents/投篮实验室

MODEL="mlx-community/Qwen2.5-0.5B-Instruct-4bit" \
ITERS=2 \
scripts/train-rag-lora.sh
```

如果用户已下载到本地目录，则用：

```bash
MODEL="/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit" \
ITERS=2 \
scripts/train-rag-lora.sh
```

优先级 3：训练完成后测试推理。

```bash
scripts/generate-rag-lora-answer.sh "低位到高位起球怎么做？"
```

如果报：

```text
Adapter path not found
```

说明还没训练成功生成 adapter。先回到训练步骤。

优先级 4：补一个人工评审/固定测试集。

可以新增一个简单 CSV/Markdown：

```text
docs/RAG_LORA_EVAL_NOTES.md
```

包含 10 个固定问题：

- 低位到高位起球怎么做？
- 手肘外翻怎么理解？
- 辅助手发力会影响什么？
- 怎么拍 side view？
- 我的投篮视频是不是有问题？ 预期拒答

每个问题记录：

- RAG 是否相关：0/1/2
- JSON 是否合法：0/1
- 引用是否合法：0/1
- 是否乱诊断：0/1
- 中文回答质量：0/1/2

这会让“微调”更像真实迭代，而不是只跑脚本。

## 和用户沟通风格

用户当前焦虑点不是复杂理论，而是“不知道在哪里操作”。继续时要：

- 用“终端里复制这条命令”的方式说。
- 少用未解释的英文缩写。
- 每次只给 1-3 条命令。
- 解释命令在做什么。
- 如果报错，让用户贴完整终端输出，不要让用户自己猜。

## 已用资料和置信度

依据：

- 本地已创建/修改的文件。
- 本地 smoke 输出。
- 本地 MLX-LM CLI 帮助输出。
- 用户贴出的终端日志。

置信度：高。

未验证：

- 用户终端中的 Hugging Face 模型下载是否已经完成。
- 真实 LoRA 训练是否已经完整跑完并生成 adapter。
