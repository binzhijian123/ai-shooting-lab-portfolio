# 评分-知识库-教程系统架构

Updated: 2026-06-19

## 目标

本架构把投篮评分维度作为专业判断骨架，再通过 Signal Registry 和 `knowledge_base.json` 转成可解释的知识点，最后路由到教程和复测目标。

它不定义最终总分公式，不做实战分，不把缺失证据扣成技术问题。

## 总链路

```text
创作者评分角度
-> 评分维度
-> 可观测 signal
-> knowledge_base 诊断/误判/修复规则
-> 用户可理解解释
-> 教程 route
-> 复测指标
```

系统运行时的反向链路是：

```text
视频 evidence packet
-> metrics
-> matched_signals
-> matched_scoring_dimensions
-> creator_angle_matches
-> matched_rules
-> repair_targets
-> tutorial_routes
```

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `distillation/douyin-shooting-coach/outputs/scoring_registry.json` | 评分维度注册表，定义维度、信号、知识标签、修复目标和教程 route |
| `distillation/douyin-shooting-coach/schemas/scoring_registry.schema.json` | 评分注册表字段合同 |
| `distillation/douyin-shooting-coach/outputs/creator_angle_mapping.json` | 创作者语言到评分维度的映射层，解释为什么某个角度能映射出某类问题 |
| `distillation/douyin-shooting-coach/schemas/creator_angle_mapping.schema.json` | 创作者角度映射字段合同 |
| `distillation/douyin-shooting-coach/outputs/knowledge_base.json` | 已蒸馏的专业知识库：规则卡、诊断规则、修复动作、Signal Registry |
| `server/visionPipeline.mjs` | 将视频证据匹配到评分维度，输出 `matched_scoring_dimensions` |
| `scripts/validate-scoring-registry.mjs` | 校验评分注册表和创作者角度映射能连上现有 Signal Registry、修复目标和教程 route |

## 三层设计

### 0. 创作者角度映射层

创作者角度映射层回答：

- 这个博主说的“手等脚”“脚下快”“前趴”在系统里属于哪个评分维度？
- 为什么这个角度可以映射出这个问题？
- 这条映射依赖哪些 signal、metric、知识点和教程？
- 哪些角度只能人工复核，不能自动强判？

这层保持独立，原因是评分维度应该稳定，而不同创作者会使用不同语言描述同一类动作问题。

### 1. 评分维度层

评分维度回答：

- 这次投篮从哪个专业角度看？
- 当前角度需要什么证据？
- 证据是否足够？
- 有无候选问题？

第一版维度：

- 时序同步
- 发力链完整性
- 下肢效率
- 重心与躯干稳定
- 上肢力线与释放链
- 辅助手控制
- 视觉与主视眼结构
- 出手质量

### 2. 知识库解释层

知识库回答：

- 这个 signal 代表什么动作逻辑？
- 常见原因是什么？
- 有哪些误判边界？
- 应该修哪条动作链？

评分维度不直接跳教程，必须先经过知识库解释。原因是同一个低分表现可能有多个根因。例如出手点低可能来自躯干前扑、肘部没抬、起球过早或距离过远。

### 3. 教程系统层

教程回答：

- 这个问题应该练什么？
- 练习的 cue 是什么？
- 复测时看哪个指标？

教程挂在 `repair_target_id` 上，而不是直接挂在分数上。这样同一个教程可以被多个评分维度复用。

## ID 链

核心连接方式是稳定 ID，而不是文本模糊匹配：

```text
creator_angle_id
-> dimension_id
-> linked_signal_ids
-> linked_knowledge_tags / concept_ids
-> repair_target_ids
-> tutorial_id
```

示例：

```text
angle.hand_waits_for_feet
-> timing_sync
-> coordination.ball_lift_lower_body_timing
-> concept.hand_waits_for_feet
-> repair.sync_ball_lift_with_push
-> tutorial.close_range_sync_ball_lift
```

## 输出策略

报告层不输出最终总分，输出维度状态：

| 状态 | 含义 |
| --- | --- |
| `evidence_candidate` | 有可观察信号支持，可进入候选诊断和教程推荐 |
| `review` | 有部分证据，需要人工复核或补拍 |
| `insufficient_evidence` | 证据不足，不给技术扣分 |
| `not_supported` | 当前系统不自动支持，只作为人工知识解释或后续扩展 |

## 边界

- 不做最终评分公式。
- 不做实战分。
- 不把命中率作为动作质量唯一指标。
- 不把缺失证据扣成技术问题。
- 不让大模型绕过 Signal Registry、知识库规则和置信度降级。
- 创作者角度映射只解释“为什么这个角度能映射到这个问题”，不等于自动高置信识别。

## 验证

运行：

```bash
npm run check:scoring
```

验收条件：

- 每个评分维度有专业定义、用户解释、判定策略和教程 route。
- 每个创作者角度映射有 `why_this_mapping_is_valid` 和 `inference_path`。
- `linked_signal_ids` 都能在 `knowledge_base.json` 的 Signal Registry 中找到。
- 映射层引用的 `dimension_id`、`signal_id`、`repair_target_id`、`tutorial_id` 都必须存在。
- 手动优先维度必须显式写入 `planned_signal_ids`，不能伪装成自动能力。
- 注册表不能包含最终总分、实战分或权重公式。
