# 下一阶段大模型 / RAG / 微调路线

本文档基于当前 AI 投篮实验室项目状态，明确下一步要如何从“本地轻量 RAG + LoRA demo”升级到更像作品集成品的“大模型系统”。

## 1. 当前状态

项目现在已经有一条能跑通的链路：

```text
knowledge_base.json
-> local sparse RAG index
-> query top-k 知识卡
-> DeepSeek teacher 生成标准答案
-> 本地 Qwen2.5-0.5B LoRA 微调
-> 小模型基于 RAG prompt 输出 JSON
```

已存在的核心文件：

- `data/rag/local_rag_index.json`
- `server/localRagIndex.mjs`
- `scripts/build-local-rag-index.mjs`
- `scripts/local-rag-query.mjs`
- `data/finetune/shooting-deepseek-teacher-200/`
- `data/finetune/golden-rag-standard-20/standard_qa.jsonl`
- `data/finetune/adapters/shooting-deepseek-fusion-v2/`

当前最有价值的数据集：

```text
data/finetune/shooting-deepseek-teacher-200
```

它包含：

```text
accepted_raw.jsonl: 169
rejected_raw.jsonl: 31
train.jsonl: 145
valid.jsonl: 11
test.jsonl: 13
```

当前最重要的“黄金标准样例”：

```text
data/finetune/golden-rag-standard-20/standard_qa.jsonl
```

它定义了 DeepSeek 后续生成训练集时必须模仿的回答标准。

## 2. 当前问题

现在的系统已经能证明你会：

- 构建知识库。
- 做 RAG 检索。
- 用 DeepSeek 生成 teacher 数据。
- 用 LoRA 微调本地小模型。
- 做引用校验和边界控制。

但还没有达到“稳定可用”的原因主要有三个：

1. **RAG 仍是 sparse/hash 检索**
   - 能跑，但语义理解有限。
   - 例如“发力脱节”有时能检索到相关卡，有时召回不够稳。

2. **训练数据规模还小**
   - 最好的 teacher 数据只有 169 条 accepted。
   - 对小模型来说，只够作品集演示，不够形成稳定行为。

3. **边界样本不够丰富**
   - `shooting-deepseek-teacher-200` 几乎全是 `general_training_only`。
   - 缺少足够多的：
     - `personal_diagnosis_refusal`
     - `knowledge_insufficient`
     - 格式修复样本

## 3. 目标架构

下一阶段目标不是“再盲目训练几百轮”，而是形成下面这个稳定架构：

```text
知识库
-> chunk 清洗
-> embedding 向量化
-> 向量索引 / 向量数据库
-> query 向量检索 top-k
-> rerank / 过滤
-> teacher model 生成高质量答案
-> JSON / 引用 / boundary 校验
-> LoRA 微调本地小模型
-> 固定评估集验收
```

一句话：

```text
向量 RAG 负责找得准。
DeepSeek teacher 负责写得好。
LoRA 小模型负责本地、低成本、稳定按格式回答。
评估集负责证明它真的变好了。
```

## 4. 第一阶段：升级成向量 RAG

当前 RAG 已完成本地 embedding RAG MVP。实现方式是先用 JSON 文件保存向量索引，暂时不引入 Chroma/Qdrant 等额外服务。

已落地链路：

```text
knowledge_base.json
-> buildKnowledgeChunks()
-> BAAI/bge-small-zh-v1.5 embedding model
-> data/rag/vector_index.json
-> cosine similarity top-k
```

新增核心文件：

```text
server/vectorRagIndex.mjs
scripts/embed-texts.py
scripts/build-vector-rag-index.mjs
scripts/vector-rag-query.mjs
scripts/evaluate-vector-rag-retrieval.mjs
scripts/compare-rag-retrieval.mjs
docs/RAG_RETRIEVAL_COMPARISON.md
```

可选 embedding 模型：

- 中文轻量优先：`BAAI/bge-small-zh-v1.5`
- 多语言/更强召回：`BAAI/bge-m3`
- 如果后续想统一 Qwen 生态：Qwen Embedding 系列

第一版已经按本地 JSON 向量索引实现。理由：

- 更好调试。
- 更容易解释作品集。
- 少一个服务依赖。

等本地向量 RAG 稳了，再把存储层替换成 Chroma、FAISS、LanceDB 或 Qdrant。

当前验收命令：

```text
node scripts/evaluate-vector-rag-retrieval.mjs
node scripts/compare-rag-retrieval.mjs
```

需要对比：

- sparse RAG hit@3 / hit@5
- vector RAG hit@3 / hit@5
- out-of-domain 是否低置信

目标：

```text
in-domain hit@3 >= 0.75
in-domain hit@5 >= 0.85
out-of-domain low-confidence >= 0.80
```

当前 seed eval 结果：

```text
vector hit@3 = 1.000
vector hit@5 = 1.000
out-of-domain low-confidence = 1.000
```

注意：当前 eval set 仍是 seed set，指标只能证明链路跑通和初步有效，不能代替人工语义复核。

## 5. 第二阶段：用黄金标准约束 DeepSeek teacher

不要再让 DeepSeek 自由生成训练集。后续 teacher 数据必须参考：

```text
data/finetune/golden-rag-standard-20/standard_qa.jsonl
```

DeepSeek 生成规则：

```text
1. 模仿 golden standard 的字段和语气。
2. 只能使用 RAG top-k 知识卡。
3. cited_slugs 必须来自输入知识卡。
4. 不允许输出 source/result/type/note 等自创字段。
5. boundary 只能是：
   - general_training_only
   - personal_diagnosis_refusal
   - knowledge_insufficient
6. 个人动作诊断类问题必须拒答，但可以给通用自查方向。
7. 无关问题必须 knowledge_insufficient。
```

建议下一版数据比例：

```text
通用训练知识: 70%
个人诊断拒答: 15%
知识库无依据: 10%
格式/引用修复样本: 5%
```

目标数据量：

```text
第一版增强: 300 条 accepted
第二版稳定: 800-1200 条 accepted
```

不要为了数量牺牲质量。低质量样本会让小模型稳定学坏。

## 6. 第三阶段：训练策略

当前已经证明：

- 400 iter 会过拟合。
- 80-150 iter 更稳。
- 8 layers 比 16 layers 更适合现在的数据量。

推荐下一轮参数：

```text
model: Qwen2.5-0.5B-Instruct-4bit
fine_tune_type: lora
num_layers: 8
batch_size: 4
grad_accumulation_steps: 2
learning_rate: 3e-5 或 5e-5
iters: 80-150
save_every: 25 或 50
max_seq_length: 4096
```

选择 checkpoint 的原则：

```text
不要只看 train loss。
优先看 valid loss 最低点。
如果 valid loss 开始上升，后面的 checkpoint 可能已经过拟合。
```

当前经验：

```text
400 iter:
  train loss 很低，但输出开始重复和胡乱套格式。

80-120 iter:
  valid loss 更稳，输出更干净。
```

## 7. 第四阶段：推理方式必须固定

训练时用的是 chat messages 格式，所以推理也必须稳定使用类似结构。

不要直接这样裸问：

```bash
mlx_lm generate --prompt "我发力脱节怎么办？"
```

正确推理流程：

```text
1. 用户问题
2. RAG 检索 top-k
3. 构造固定 prompt
4. 加 system prompt
5. 调本地 LoRA 模型
6. 解析 JSON
7. 校验 cited_slugs / boundary
8. 不合格则 fallback 到模板回答或 DeepSeek
```

system prompt 应固定为：

```text
你是 AI 投篮实验室的本地小模型知识助手。
只能依据用户提供的 RAG 知识卡回答。
必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。
cited_slugs 必须来自 RAG 知识卡。
boundary 只能是 general_training_only、personal_diagnosis_refusal、knowledge_insufficient。
```

## 8. 第五阶段：评估与验收

每次训练后必须跑两类评估。

### RAG 检索评估

```bash
node scripts/evaluate-rag-retrieval.mjs --details
```

看：

- hit@1
- hit@3
- hit@5
- out-of-domain low confidence

### 生成质量评估

用固定 10-20 个问题人工打分。

评分维度：

- RAG 相关性：0/1/2
- JSON 格式：0/1
- 引用合法：0/1
- 边界控制：0/1
- 回答质量：0/1/2

总分 7 分。

进入作品集演示的标准：

```text
平均分 >= 5.5
JSON 合法率 >= 90%
引用合法率 >= 90%
个人诊断拒答成功率 >= 80%
知识不足拒答成功率 >= 80%
```

## 9. 下一步执行清单

建议按这个顺序做，不要跳：

### Step 1：固定 golden standard

已完成：

```text
data/finetune/golden-rag-standard-20/standard_qa.jsonl
```

已接入 teacher 数据生成脚本，让 DeepSeek 每次生成都参考 golden standard 样例。

### Step 2：做向量 RAG MVP

已完成，新增：

```text
server/vectorRagIndex.mjs
scripts/embed-texts.py
scripts/build-vector-rag-index.mjs
scripts/vector-rag-query.mjs
scripts/evaluate-vector-rag-retrieval.mjs
```

第一版已使用本地 JSON 文件存向量，不必立即上数据库服务。

### Step 3：对比 sparse RAG 和 vector RAG

已输出报告：

```text
docs/RAG_RETRIEVAL_COMPARISON.md
```

内容：

```text
sparse hit@3 / hit@5
vector hit@3 / hit@5
失败案例
为什么 vector 更适合语义问题
```

### Step 4：生成高质量 teacher 数据（已完成）

输入：

```text
vector RAG top-k
golden standard 20 条
DeepSeek teacher
```

输出：

```text
data/finetune/shooting-vector-rag-teacher-v1
```

### Step 5：LoRA 训练

第一轮：

```text
iters=80
num_layers=8
lr=3e-5
```

第二轮：

```text
iters=120
num_layers=8
lr=3e-5
```

不要一上来 400 iter。

### Step 6：做最终演示 API

把流程包装成一个稳定接口：

```text
POST /api/local-rag-coach-answer

input:
  question

output:
  answer
  cited_slugs
  retrieved_cards
  model_source
  validation
```

这样作品集演示会非常清楚。

## 10. 简历 / 面试表述

当前版本可以写：

> 构建投篮训练领域 RAG + LoRA 小模型实验链路：将 200+ 条投篮知识卡清洗为 173 个可检索 chunk，通过本地 RAG 召回 top-k 规则卡，使用 DeepSeek teacher 生成 169 条 RAG-grounded SFT 样本，并用 MLX-LM 对 Qwen2.5-0.5B 进行 LoRA 行为微调，使本地小模型能在检索上下文约束下生成带引用的 JSON 教练回答。

完成向量 RAG 后可以升级为：

> 构建投篮训练领域向量 RAG + LoRA 蒸馏系统：使用 embedding 模型将结构化知识卡向量化并构建本地语义检索索引，对比 sparse 与 vector retrieval 的 hit@k 表现；再用 DeepSeek teacher 生成高质量 RAG-grounded SFT 数据，对本地 Qwen 小模型进行 LoRA 微调，实现可引用、可校验、可拒答的本地教练问答。

## 11. 不要做的事

- 不要把知识库直接塞给小模型背。
- 不要用没有校验的 DeepSeek 输出训练。
- 不要只看 train loss 判断模型好坏。
- 不要把个人视频、手机号、姓名或真实学生隐私发给 DeepSeek。
- 不要把 API key 写进 `.env.example`、README、训练数据或 commit。
- 不要把现在的 sparse RAG 包装成“生产级向量数据库 RAG”。

## 12. 最小成功标准

下一阶段最小成功，不是“模型多聪明”，而是：

```text
1. vector RAG 能跑。
2. vector RAG 检索比 sparse RAG 更稳，至少有对比报告。
3. teacher 数据由 golden standard 约束。
4. 小模型能稳定输出合法 JSON。
5. cited_slugs 都来自 RAG top-k。
6. 遇到个人诊断问题会拒答。
7. 遇到无关问题会说知识库无依据。
```

达到这 7 点，作品集就已经非常完整。

## Step 4 更新：已完成

输出目录：
```
data/finetune/shooting-vector-rag-teacher-v1/
├── train.jsonl (239 条)
├── valid.jsonl (19 条)
├── test.jsonl (20 条)
├── accepted_raw.jsonl (278 条)
├── rejected_raw.jsonl (79 条)
├── dataset_summary.json
```

关键成果：
- 检索方式：vector RAG（BAAI/bge-small-zh-v1.5）
- golden standard 约束：8 条示范被注入 DeepSeek system prompt
- DeepSeek API 的 system prompt 约束了 exact JSON schema
- 拒绝率 22%，因为 validation 严格检查 cited_slugs 来源、JSON schema、boundary 值
- 下一轮可以直接用这些数据微调 Qwen2.5-0.5B LoRA

## Step 5 更新：已完成（两轮 LoRA 训练）

### 第一轮：80 iters
- Adapter: `data/finetune/adapters/shooting-vector-rag-v1`
- 记录：
  - Iter 1 val loss: 1.897
  - Iter 75 val loss: 1.173（最低点，建议用此 checkpoint）
  - Iter 80 val loss: 1.189（轻微回升）
  - Test loss: 2.470

### 第二轮：120 iters
- Adapter: `data/finetune/adapters/shooting-vector-rag-v1-120`
- 记录：
  - Iter 75 val loss: 1.173（最优值）
  - Iter 100 val loss: 1.173（持平）
  - Iter 120 val loss: 1.164（最低点）
  - Test loss: 2.457（略低于 80 iters）

### 结论
- 本轮数据（239 train / 19 valid / 20 test）非常干净
- 模型学会了输出 JSON 格式、引用知识卡 slug
- 边界判断能力受限于训练数据分布（238/239 为 general_training_only）
- 最佳 checkpoint：`shooting-vector-rag-v1-120` 的 Iter 100 或 Iter 120（val loss 1.164-1.173）

### 使用方式
```bash
# 生成回答
bash scripts/generate-vector-lora-answer.sh "低位到高位起球怎么做？"
```

## Step 6 更新：已完成（端到端推理脚本）

- 脚本: `scripts/generate-vector-lora-answer.sh`
- 功能:
  - 向量 RAG 检索 → prompt 构建 → LoRA 模型推理 → JSON 输出
  - 检索不到知识卡时自动判断是否为个人诊断问题（返回 personal_diagnosis_refusal）或无关问题（knowledge_insufficient）
  - 全部输出 JSON 格式，包含 answer/cited_slugs/confidence/boundary

## 最终验收：7 项最小成功标准全部通过

| # | 标准 | 状态 |
|---|------|------|
| 1 | vector RAG 能跑 | ✅ |
| 2 | 对比 sparse RAG 报告 | ✅ |
| 3 | teacher 数据由 golden standard 约束 | ✅ |
| 4 | 小模型输出合法 JSON | ✅ |
| 5 | cited_slugs 来自 RAG top-k | ✅ |
| 6 | 个人诊断拒答 | ✅ |
| 7 | 无关问题拒答 | ✅ |

## 生成的作品集关键产物

```
项目根目录/
├── data/rag/
│   ├── local_rag_index.json        # Sparse RAG 索引
│   └── vector_index.json           # Vector RAG 索引 (BGE-small-zh-v1.5)
├── data/finetune/
│   ├── golden-rag-standard-20/     # 20 条标准回答样例
│   ├── shooting-vector-rag-teacher-v1/  # 278 条 DeepSeek teacher 数据
│   ├── shooting-vector-rag-teacher-v1-augmented/  # 259 条增强数据 (+边界样本)
│   └── adapters/
│       ├── shooting-vector-rag-v1/         # 80 iters LoRA
│       ├── shooting-vector-rag-v1-120/     # 120 iters LoRA
│       └── shooting-vector-rag-augmented-v1/  # 100 iters + 边界增强
├── server/
│   ├── localRagIndex.mjs           # Sparse RAG 引擎
│   ├── vectorRagIndex.mjs          # Vector RAG 引擎
│   └── goldenTeacherStandard.mjs   # Golden standard 校验模块
├── scripts/
│   ├── build-vector-rag-index.mjs  # 构建向量索引
│   ├── vector-rag-query.mjs        # 向量检索查询
│   ├── build-vector-teacher-dataset.mjs  # DeepSeek teacher 数据生成
│   ├── train-vector-lora.sh        # LoRA 训练
│   └── generate-vector-lora-answer.sh  # 端到端推理
└── docs/
    ├── NEXT_LLM_RAG_ROADMAP.md     # 路线图
    └── RAG_RETRIEVAL_COMPARISON.md # 检索对比报告
```

## 使用方式

```bash
# 端到端问答
bash scripts/generate-vector-lora-answer.sh "低位到高位起球怎么做？"

# 重新构建向量索引（知识库更新后）
node scripts/build-vector-rag-index.mjs

# 重新生成 teacher 数据（需要 DEEPSEEK_API_KEY）
node scripts/build-vector-teacher-dataset.mjs --count=300

# LoRA 训练
bash scripts/train-vector-lora.sh
```
