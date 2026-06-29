# Diagnosis Framework

Updated: 2026-06-14

## 事实来源

- 203 张规则卡：`distillation/douyin-shooting-coach/outputs/cards/`
- 方法论文档：`outputs/methodology/overall_methodology.md`, `shooting_quality_rules.md`, `repair_playbook.md`
- 结构化知识库：`outputs/knowledge_base.json`
- Obsidian 图谱：`obsidian/投篮规则知识图谱/`

## 总原则

诊断不是单一指标阈值判断。系统必须先提取可观察 signal，再结合规则卡、误判边界、视角、帧率、模型置信度和个人基线输出候选诊断。

报告必须区分：

- `confirmed_by_evidence`：证据链完整，可给中高置信建议。
- `candidate`：有信号但缺少部分上下文，只能给复核建议。
- `missing_evidence`：缺少必要视角、模型输出、帧率或球路证据。
- `not_supported`：当前视频或模型不能支持该判断。

## 诊断域

| 诊断域 | 关键问题 | 主要证据 | 必要视角 | 输出边界 |
| --- | --- | --- | --- | --- |
| 发力链 | 下肢、核心、上肢是否顺序传导 | 髋/膝/踝伸展、躯干稳定、肘腕释放、时序差 | 侧面优先，正面补充 | 缺侧面时不得下强诊断 |
| 力线 | 脚膝髋肩肘腕是否同向 | 膝脚方向、肩肘腕线、手腕侧拨、球路偏移 | 正面优先，侧面补充 | 只有侧面时只能提示需要正面复核 |
| 时序 | 沉球、降重心、蹬地、起球、出手是否同步 | `ball_lift_knee_delta_ms`、关键帧、metric_series | 侧面 60fps 优先 | 低帧率只能低置信 |
| 辅助手 | 是否主动发力或未及时分离 | 辅助手位置、拇指拨球、出手瞬间双手关系 | 正面或斜前方 | 当前 signal registry 尚不完整，先作为待扩展 |
| 出手质量 | 出手高度、角度、肘腕释放稳定性 | release height、release angle、elbow/wrist variability | 侧面 + 正面 | 不等于命中率评分 |
| 个体差异 | 风格、主视眼、伤病、疲劳、力量差异 | 用户画像、长期基线、人工反馈 | 多次复测 | 不把个人风格强行判为错误 |
| 前后对比 | 修复前后是否改善 | 同一球员、同类投篮、多次 session 的趋势 | 同视角同帧率 | 不同拍摄条件不可直接比较 |
| 球轨迹 | 球路偏移、过筐序列、候选命中 | YOLO ball/rim、trajectory、shot_events | 侧后方或正侧面视角，需篮筐入镜 | 当前仅启发式，不作为稳定结论 |

## 证据链合同

每条诊断必须至少包含：

- 一个 `signal_id` 或 `missing_evidence`。
- 一个 `metric_id` 或模型输出字段。
- 一个 `frame` 或 frame range。
- 一个 `rule_id` 或 `source_card_id`。
- 一个 `confidence`，且不得超过 `confidence.max_report_confidence`。
- 一个 `false_positive_check` 或不确定性说明。

## 已有 Signal Registry

当前 `knowledge_base.json` 里有 9 个结构化 signal：

- `posture.forward_trunk_lean_at_release`
- `release.low_release_height`
- `lower_body.preparatory_flexion_pattern`
- `upper_body.elbow_height_and_flexion_preparatory`
- `upper_body.forearm_angle_from_vertical`
- `release.release_angle_context`
- `coordination.elbow_wrist_release_variability`
- `coordination.ball_lift_lower_body_timing`
- `context.shot_distance_changes_mechanics`

这些 signal 覆盖了侧面姿态、释放、上肢、时序和投篮距离变化，但还不足以完整覆盖辅助手分离、正面力线、稳定球轨迹和多角度融合。

## 身体角度到知识库问题映射基准

机器可读基准位于 `distillation/douyin-shooting-coach/outputs/body_angle_problem_mapping.json`，运行模块位于 `server/angleKnowledgeRetrieval.mjs`。

映射链固定为：

```text
angle definition
-> normalized angle curve
-> observable pattern
-> evidence-family gate
-> candidate problem
-> explicit knowledge tags and terms
-> matched source cards and diagnosis rules
```

当前定义8类角度、22个观察信号和13类候选问题。基准优先级为：同球员同投篮场景、同类本地样本、同场景同行评审论文、工程暂定值。论文均值只作为变量选择和场景先验，不直接作为错误线。

问题映射必须满足：

- 单角度只能进入 `observed`。
- 至少两个独立证据家族满足规则后才能进入 `candidate`。
- 缺少规则要求视角时返回 `not_judgable`，不检索诊断卡。
- 达到重复比例后进入 `supported_pattern`，仍需人工复核才允许 `diagnosis_allowed=true`。
- 每个知识库结果必须返回 `source_card_id`、命中标签、命中检索词和匹配规则。

当前13类问题包括：下肢准备负荷不足、加载过深且转化慢、膝主导、髋伸展参与不足、踝末端输出不足、三关节伸展不连续、上肢抢跑、下肢输出与起球脱节、身体前扑、低大臂/低释放空间、肘前臂力线偏移、手腕横向补偿和肘腕释放协同不稳定。

HTTP接口：

- `GET /api/body-angle-problem-mapping`：读取基准摘要。
- `POST /api/angle-knowledge-retrieval`：输入标准化 observation 和 context，返回问题状态及知识库匹配。

## 定点投篮

定点投篮是第一版最高优先级。原因是动作起点稳定、视角要求可控、发力链和时序更容易复测。

置信度策略：

- 侧面 60fps + MediaPipe 或 RTMPose 有效 + 关键帧完整：可给中置信候选诊断。
- 正面 + 侧面都有：可补充力线和辅助手判断。
- 只有侧面：可判断时序、躯干前倾、释放高度；正面力线只能列为 missing evidence。
- 只有正面：可判断部分力线；时序和释放高度只能低置信。
- 帧率低于 60fps：时序判断自动降级。

## 接球投篮

接球投篮涉及来球、合球、降重心和脚步节奏，当前系统没有专门的来球识别和接球事件分割。

置信度风险：

- 合球时刻和来球方向未自动识别时，不得把“接球不同步”写成高置信。
- 可输出的内容应限制为候选复核：合球轨迹、降重心同步、起球时序、身体平衡。
- 需要额外输入：接球前 1 秒完整入镜、球员脚步完整入镜、球和双手清晰可见。

## 运球后投篮

运球后投篮涉及运球节奏、收球、急停、重心刹车和动态平衡。当前没有完整运球事件识别，也没有动态投篮专属指标。

置信度风险：

- 不得把定点投篮规则直接套用为高置信诊断。
- 可先判断低置信候选：重心前冲、躯干失控、起球过早、收球轨迹明显绕身体。
- 需要额外输入：运球最后两拍、合球、急停、起跳和出手全过程入镜。
- 若只有出手瞬间片段，应提示重拍。

## 前后对比规则

前后对比必须满足：

- 同一球员。
- 同一投篮类型。
- 相近机位、视角、帧率和拍摄距离。
- 同一核心 metric 可追踪。
- 至少两次可用 session，且低置信 session 不自动进入长期趋势。

如果拍摄条件不同，报告只能说“不可直接比较”，并列出差异原因。

## 误判边界

- 精英球员或高命中球员的非标准动作可能是个人风格。
- 力量不足、疲劳或伤病可能造成动作变形，不应直接归因于技术错误。
- 主视眼和身体结构可能影响起球路径。
- 球路偏移是结果信号，不能单独反推根因。
- 低清、遮挡、半身、篮筐缺失或低帧率视频必须降级。
