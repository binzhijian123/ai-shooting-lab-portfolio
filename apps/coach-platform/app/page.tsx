import {
  ARC_LAB_PLATFORM_BOUNDARY,
  readSupabaseBoundary
} from "../lib/supabase-boundary";

const coachQueue = [
  { name: "小明", status: "复测待看", detail: "同视角作业已上传，优先确认训练是否迁移" },
  { name: "小凯", status: "课堂待确认", detail: "AI 草稿仅供教练编辑，学生暂不可见" },
  { name: "小林", status: "计划待发布", detail: "需发布教练反馈后生成学生训练计划" }
];

const studentPlan = [
  "先看教练最终反馈",
  "完成 3 步训练计划",
  "按指定视角上传复测"
];

export default function Page() {
  const boundary = readSupabaseBoundary(process.env);

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="kicker">Arc Lab Coach OS</p>
          <h1>教练主导的投篮复盘工作台</h1>
        </div>
        <a className="open-local" href={ARC_LAB_PLATFORM_BOUNDARY.localShellFallback}>
          打开本地验收版
        </a>
      </header>

      <section className="grid" aria-label="Coach OS platform scaffold">
        <div className="panel queue-panel">
          <div className="panel-title">
            <h2>教练待办</h2>
            <span>{coachQueue.length} 项</span>
          </div>
          <ul className="queue-list">
            {coachQueue.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.status}</span>
                <p>{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>学生端结果</h2>
            <span>教练反馈</span>
          </div>
          <ol className="plan-list">
            {studentPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className="note">
            学生端只把教练发布的反馈作为最终依据；AI 草稿、编辑 diff、原始证据追踪默认隐藏。
          </p>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>Supabase 边界</h2>
            <span>{boundary.publicEnvConfigured ? "env ready" : "env missing"}</span>
          </div>
          <dl className="boundary-list">
            <div>
              <dt>Live Supabase</dt>
              <dd>{String(boundary.liveSupabaseProjectVerified)}</dd>
            </div>
            <div>
              <dt>SMS Auth</dt>
              <dd>{String(boundary.liveSmsAuthVerified)}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{String(boundary.liveStorageVerified)}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{boundary.runtimeStatus}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
