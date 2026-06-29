# Goal Backlog

Updated: 2026-06-14

## Phase 1 Goal

```text
/goal 完成投篮实验室 MVP Phase 1：验收基线和样例视频闭环。

目标：
- 用 1-3 个授权样例视频验证上传、姿态、球路候选、evidence_packet.v1、报告、SQLite 记忆是否形成可复测闭环。

完成标准：
1. 建立样例视频 manifest，记录来源、授权、保存期限、视角、帧率、投篮类型。
2. 至少一个样例完成上传、分析、报告生成和 session 保存。
3. 输出 evidence packet、报告 mode、model health、SQLite session 的验收记录。
4. 低置信或缺证据原因能在页面看到。

验证方式：
- 运行 node server/index.mjs --check。
- 打开 http://localhost:4173 完成一次样例分析。
- 检查 /api/sessions 返回新增 session。
- 检查报告没有把球轨迹或命中判断写成稳定能力。

约束：
- 只使用授权样例或合成视频。
- 不上传真实校队视频。
- 不把付费 API 作为硬依赖。
```

## Phase 2 Goal

```text
/goal 完成投篮实验室 MVP Phase 2：报告合同落地到前端。

目标：
- 把球员版 player_report.v1 和实验室版 lab_report.v1 分开展示，避免报告只停留在后端结构里。

完成标准：
1. 定义并生成 player_report.v1 和 lab_report.v1。
2. 前端展示球员版：主问题、证据摘要、训练动作、下次拍摄要求。
3. 前端展示实验室版：metrics、signals、rules、missing_evidence、model_status、validation_errors。
4. 每条诊断引用 signal_id、metric_id、frame、rule_id 或 missing_evidence。

验证方式：
- 用样例 evidence packet 生成两个报告。
- 检查前端两个报告视图内容不同且字段完整。
- 用非法 rule_id 或 frame 做一次负向测试，确认校验失败。

约束：
- 不新增不可追溯结论。
- 不把低置信 missing evidence 写成动作错误。
```

## Phase 3 Goal

```text
/goal 完成投篮实验室 MVP Phase 3：球轨迹模块独立化。

目标：
- 把 YOLO adapter 的球路结果独立成 ball_trajectory.v1 和 Ball Trajectory Card，并建立失败降级。

完成标准：
1. 定义 ball_trajectory.v1 输出结构。
2. 前端新增 Ball Trajectory Card。
3. 支持 tracked、candidate、insufficient_evidence、not_available 状态。
4. 缺球、缺筐、轨迹不连续、adapter 未配置分别显示不同失败原因。

验证方式：
- 用合成或授权样例触发至少两种状态。
- 检查报告只把球轨迹作为候选证据。
- 检查当前 YOLO 启发式没有被写成稳定能力。

约束：
- 不编造命中/未中。
- 不把 YOLO 抽帧结果冒充连续轨迹。
```

## Phase 4 Goal

```text
/goal 完成投篮实验室 MVP Phase 4：多角度输入。

目标：
- 支持同一次投篮的正面 + 侧面输入，并合并证据。

完成标准：
1. 前端支持同一 session 上传 front 和 side 视频。
2. 后端 evidence packet 标记每个 metric、signal、rule 的视角来源。
3. 合并规则能区分侧面时序和正面力线。
4. 缺视角时自动写入 missing_evidence。

验证方式：
- 使用一组授权 front+side 样例。
- 检查 side-only、front-only、front+side 三种结果差异。
- 检查缺视角不会输出高置信对应结论。

约束：
- 不要求用户手动同步关键帧作为普通主流程。
- 允许 Phase 4 先用近似 session grouping，不做精确多机位同步。
```

## Phase 5 Goal

```text
/goal 完成投篮实验室 MVP Phase 5：教练式动态画线。

目标：
- 在视频上叠加力线、角度线、发力链线，并随关键点播放和 seek 移动。

完成标准：
1. 实现动态线层 renderer。
2. 支持膝、髋、肘、躯干角度线。
3. 支持脚膝髋、肩肘腕力线。
4. 支持发力链时序标记。
5. 缺关键点时不画线并提示原因。

验证方式：
- 用授权样例播放、暂停、seek，确认线条跟随。
- 对低置信关键点样例确认线条降级。
- 截图验收 overlay 不错位。

约束：
- 不绘制静态假线。
- 不要求导出带画线视频，除非另设目标。
```

## Phase 6 Goal

```text
/goal 完成投篮实验室 MVP Phase 6：个人记忆系统产品化。

目标：
- 把本地 SQLite 记忆扩展成用户画像、历史问题、训练目标和趋势复测。

完成标准：
1. 增加本地用户档案字段。
2. 展示历史问题、训练目标、复测指标和趋势。
3. 低置信 session 默认不进入长期趋势。
4. 用户可删除 session 或清空本地记忆。

验证方式：
- 保存至少两次高置信 session 后显示趋势。
- 保存一次低置信 session 后确认只进入 review。
- 删除 session 后趋势重新计算。

约束：
- 不实现云端账号。
- 不保存不必要个人身份信息。
```

## Phase 7 Goal

```text
/goal 完成投篮实验室 MVP Phase 7：登录、云端和隐私方案。

目标：
- 在用户确认产品形态、部署方向和隐私边界后，设计登录、云端存储和跨设备同步。

完成标准：
1. 明确客户端形态和部署服务商。
2. 定义账号、组织、球员、教练权限。
3. 定义视频是否上云、保存期限、删除、导出、撤回授权。
4. 定义真实校队视频内部迭代和禁止用途。
5. 输出技术方案和隐私政策更新草案。

验证方式：
- 用 threat model 检查数据泄露、误授权、误分享风险。
- 用用户故事检查球员、教练、管理员权限。
- 检查云端方案不与 Phase 0.5 隐私边界冲突。

约束：
- 未确认前不接入云端硬依赖。
- 不上传真实校队视频。
- 不把登录/云端写成当前已完成事实。
```
