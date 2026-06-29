import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

let db;

export async function initMemoryStore(dataDir) {
  await mkdir(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, "shooting_lab.sqlite"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      saved_at TEXT NOT NULL,
      title TEXT NOT NULL,
      user_id TEXT NOT NULL,
      camera_view TEXT NOT NULL,
      fps INTEGER NOT NULL,
      overall_confidence REAL NOT NULL,
      memory_status TEXT NOT NULL,
      training_goal TEXT,
      metrics_json TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      report_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      feedback_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_training_sessions_user_time
      ON training_sessions(user_id, saved_at DESC);
  `);
}

export function readSessions(limit = 25) {
  const store = requireStore();
  const rows = store
    .prepare(`
      SELECT session_id, saved_at, title, user_id, camera_view, fps, overall_confidence,
             memory_status, training_goal, metrics_json, signals_json, report_json,
             evidence_json, feedback_json
      FROM training_sessions
      ORDER BY saved_at DESC
      LIMIT ?
    `)
    .all(limit);

  return rows.map(rowToSession);
}

export function saveTrainingSession(body) {
  const store = requireStore();
  const evidence = body.evidence || {};
  const report = body.report || {};
  const confidence = Number(evidence.confidence?.overall || 0);
  const lowConfidence = confidence < 0.65 || hasLowConfidenceSignals(evidence);
  const memoryStatus = normalizeMemoryStatus(body.memory_status) || (lowConfidence ? "short_term_review" : "long_term");
  const savedAt = new Date().toISOString();
  const userId = evidence.user_profile?.user_id || "local_user_001";
  const sessionId = body.session_id || evidence.session_id || `session_${Date.now()}`;

  store
    .prepare(`
      INSERT INTO training_sessions (
        session_id, saved_at, title, user_id, camera_view, fps, overall_confidence,
        memory_status, training_goal, metrics_json, signals_json, report_json,
        evidence_json, feedback_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        saved_at=excluded.saved_at,
        title=excluded.title,
        user_id=excluded.user_id,
        camera_view=excluded.camera_view,
        fps=excluded.fps,
        overall_confidence=excluded.overall_confidence,
        memory_status=excluded.memory_status,
        training_goal=excluded.training_goal,
        metrics_json=excluded.metrics_json,
        signals_json=excluded.signals_json,
        report_json=excluded.report_json,
        evidence_json=excluded.evidence_json,
        feedback_json=excluded.feedback_json
    `)
    .run(
      sessionId,
      savedAt,
      body.title || evidence.video_context?.file_name || "local_upload.mp4",
      userId,
      evidence.session?.camera_view || evidence.video_context?.camera_view || "unknown",
      Number(evidence.session?.fps || evidence.video_context?.fps || 0),
      confidence,
      memoryStatus,
      evidence.user_profile?.goal || null,
      JSON.stringify(evidence.metrics || {}),
      JSON.stringify(evidence.matched_signals || []),
      JSON.stringify(report),
      JSON.stringify(evidence),
      body.feedback ? JSON.stringify(body.feedback) : null
    );

  return {
    ok: true,
    session_id: sessionId,
    saved_at: savedAt,
    memory_status: memoryStatus,
    long_term_written: memoryStatus === "long_term"
  };
}

export function deleteTrainingSession(sessionId) {
  const store = requireStore();
  if (!sessionId || typeof sessionId !== "string") {
    return { ok: false, deleted: 0, session_id: sessionId || null, error: "missing_session_id" };
  }
  const result = store
    .prepare("DELETE FROM training_sessions WHERE session_id = ?")
    .run(sessionId);
  const deleted = Number(result.changes || 0);
  return {
    ok: deleted > 0,
    deleted,
    session_id: sessionId
  };
}

export function deleteUserTrainingSessions(userId) {
  const store = requireStore();
  if (!userId || typeof userId !== "string") {
    return { ok: false, deleted: 0, user_id: userId || null, error: "missing_user_id" };
  }
  const result = store
    .prepare("DELETE FROM training_sessions WHERE user_id = ?")
    .run(userId);
  const deleted = Number(result.changes || 0);
  return {
    ok: true,
    deleted,
    user_id: userId,
    scope: "local_sqlite_sessions_only",
    raw_video_deleted: false
  };
}

export function buildMemorySummary(userId = "local_user_001") {
  const sessions = readSessions(50).filter((session) => session.user_id === userId);
  const longTerm = sessions.filter((session) => session.memory_status === "long_term");
  const trendSource = longTerm.slice(0, 12).reverse();
  const timing = trendSource
    .map((session) => Number(session.metrics.ball_lift_knee_delta_ms))
    .filter(Number.isFinite);
  const trunk = trendSource
    .map((session) => Number(session.metrics.trunk_lean_release_deg))
    .filter(Number.isFinite);

  return {
    user_id: userId,
    session_count: sessions.length,
    long_term_session_count: longTerm.length,
    review_session_count: sessions.length - longTerm.length,
    profile: {
      user_id: userId,
      storage: "local_sqlite",
      primary_training_goal: collectTrainingGoals(longTerm)[0]?.goal || sessions[0]?.training_goal || null,
      latest_camera_view: sessions[0]?.camera_view || null,
      latest_confidence: sessions[0]?.overall_confidence ?? null
    },
    training_goals: collectTrainingGoals(sessions),
    recurring_signals: collectRecurringSignals(longTerm),
    confidence_policy: {
      trend_source: "long_term_only",
      review_sessions_excluded: sessions.length - longTerm.length,
      low_confidence_sessions_require_manual_promotion: true
    },
    latest: sessions[0] || null,
    trend: {
      metric: "ball_lift_knee_delta_ms",
      values: timing,
      delta_ms: timing.length >= 2 ? Math.round(timing.at(-1) - timing[0]) : null,
      direction: trendDirection(timing, true),
      trunk_lean_values: trunk
    },
    next_focus: timing.length && timing.at(-1) > 100
      ? "继续复测起球-下肢启动时序差，目标压到 100ms 内。"
      : "维持节奏同步，下一次重点复测出手稳定性和球路偏移。"
  };
}

function collectTrainingGoals(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const goal = session.training_goal || "未记录目标";
    const current = counts.get(goal) || { goal, count: 0, last_seen: session.saved_at };
    current.count += 1;
    if (!current.last_seen || session.saved_at > current.last_seen) current.last_seen = session.saved_at;
    counts.set(goal, current);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || String(b.last_seen).localeCompare(String(a.last_seen)))
    .slice(0, 5);
}

function collectRecurringSignals(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    for (const signal of session.matched_signals || []) {
      const status = signal.status || "unknown";
      if (!["candidate", "low_confidence", "not_judgable"].includes(status)) continue;
      const key = signal.signal_id || signal.name || "unknown_signal";
      const current = counts.get(key) || {
        signal_id: key,
        name: signal.name || key,
        count: 0,
        latest_status: status,
        latest_confidence: Number(signal.confidence || 0),
        latest_seen: session.saved_at
      };
      current.count += 1;
      if (!current.latest_seen || session.saved_at > current.latest_seen) {
        current.latest_status = status;
        current.latest_confidence = Number(signal.confidence || 0);
        current.latest_seen = session.saved_at;
      }
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || String(b.latest_seen).localeCompare(String(a.latest_seen)))
    .slice(0, 6);
}

function rowToSession(row) {
  return {
    session_id: row.session_id,
    saved_at: row.saved_at,
    title: row.title,
    user_id: row.user_id,
    camera_view: row.camera_view,
    fps: row.fps,
    overall_confidence: row.overall_confidence,
    memory_status: row.memory_status,
    training_goal: row.training_goal,
    metrics: JSON.parse(row.metrics_json),
    matched_signals: JSON.parse(row.signals_json),
    report: JSON.parse(row.report_json),
    evidence: JSON.parse(row.evidence_json),
    feedback: row.feedback_json ? JSON.parse(row.feedback_json) : null
  };
}

function hasLowConfidenceSignals(evidence) {
  return (evidence.matched_signals || []).some((signal) => {
    return signal.status === "not_judgable" || Number(signal.confidence || 0) < 0.5;
  });
}

function normalizeMemoryStatus(value) {
  return ["long_term", "short_term_review"].includes(value) ? value : null;
}

function trendDirection(values, lowerIsBetter) {
  if (values.length < 2) return "insufficient_data";
  const delta = values.at(-1) - values[0];
  if (Math.abs(delta) < 8) return "flat";
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  return improving ? "improving" : "worsening";
}

function requireStore() {
  if (!db) throw new Error("memory store has not been initialized");
  return db;
}
