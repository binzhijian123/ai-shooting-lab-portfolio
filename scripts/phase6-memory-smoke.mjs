import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
const userId = `phase6_smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const sessionIds = [
  `${userId}_long_1`,
  `${userId}_long_2`,
  `${userId}_review_1`
];
let serverProcess = null;
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const first = await saveSession(baseUrl, sessionIds[0], makeEvidence({
    userId,
    sessionId: sessionIds[0],
    memoryStatus: "long_term",
    timingMs: 220,
    trunkDeg: 7,
    confidence: 0.86
  }), "long_term");
  await delay(20);
  const second = await saveSession(baseUrl, sessionIds[1], makeEvidence({
    userId,
    sessionId: sessionIds[1],
    memoryStatus: "long_term",
    timingMs: 120,
    trunkDeg: 4,
    confidence: 0.88
  }), "long_term");
  await delay(20);
  const review = await saveSession(baseUrl, sessionIds[2], makeEvidence({
    userId,
    sessionId: sessionIds[2],
    memoryStatus: "short_term_review",
    timingMs: 999,
    trunkDeg: 18,
    confidence: 0.42,
    signalStatus: "low_confidence"
  }), "short_term_review");

  assert(first.long_term_written === true, "first long_term was not written as long-term");
  assert(second.long_term_written === true, "second long_term was not written as long-term");
  assert(review.long_term_written === false, "review session must not be long-term");

  const memory = await fetchJson(`${baseUrl}/api/memory-summary?user_id=${encodeURIComponent(userId)}`);
  assert(memory.user_id === userId, "memory user_id mismatch");
  assert(memory.session_count === 3, `expected 3 sessions, got ${memory.session_count}`);
  assert(memory.long_term_session_count === 2, `expected 2 long-term sessions, got ${memory.long_term_session_count}`);
  assert(memory.review_session_count === 1, `expected 1 review session, got ${memory.review_session_count}`);
  assert(memory.profile?.storage === "local_sqlite", "profile storage mismatch");
  assert(memory.profile?.primary_training_goal === "Phase 6 trend smoke", "primary training goal mismatch");
  assert(Array.isArray(memory.training_goals) && memory.training_goals[0]?.count === 3, "training goals aggregation mismatch");
  assert(memory.confidence_policy?.trend_source === "long_term_only", "trend source must be long_term_only");
  assert(memory.confidence_policy?.review_sessions_excluded === 1, "review exclusion count mismatch");
  assert(memory.confidence_policy?.low_confidence_sessions_require_manual_promotion === true, "manual promotion policy missing");
  assert(JSON.stringify(memory.trend?.values) === JSON.stringify([220, 120]), `trend values must exclude review session: ${JSON.stringify(memory.trend?.values)}`);
  assert(memory.trend?.delta_ms === -100, `expected trend delta -100, got ${memory.trend?.delta_ms}`);
  assert(memory.trend?.direction === "improving", `expected improving trend, got ${memory.trend?.direction}`);
  const timingSignal = (memory.recurring_signals || []).find((item) => item.signal_id === "coordination.ball_lift_lower_body_timing");
  assert(timingSignal?.count === 2, `expected recurring long-term signal count 2, got ${timingSignal?.count}`);

  const deleteResults = [];
  for (const sessionId of [...sessionIds]) {
    deleteResults.push(await deleteSession(baseUrl, sessionId));
    sessionIds.shift();
  }
  const afterDelete = await fetchJson(`${baseUrl}/api/memory-summary?user_id=${encodeURIComponent(userId)}`);
  assert(afterDelete.session_count === 0, `expected cleanup to remove test sessions, got ${afterDelete.session_count}`);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase6_memory_smoke.v1",
    user_id: userId,
    saved: {
      long_term_written: [first.long_term_written, second.long_term_written],
      review_long_term_written: review.long_term_written
    },
    memory: {
      session_count: memory.session_count,
      long_term_session_count: memory.long_term_session_count,
      review_session_count: memory.review_session_count,
      trend_source: memory.confidence_policy.trend_source,
      review_sessions_excluded: memory.confidence_policy.review_sessions_excluded,
      trend_values: memory.trend.values,
      trend_delta_ms: memory.trend.delta_ms,
      trend_direction: memory.trend.direction,
      recurring_signal_count: timingSignal.count
    },
    cleanup: {
      deleted_count: deleteResults.filter((item) => item.ok).length,
      after_delete_session_count: afterDelete.session_count
    }
  }, null, 2));
} finally {
  for (const sessionId of sessionIds) {
    if (!sessionId) continue;
    await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`session cleanup status ${response.status}: ${sessionId}`))
      .catch((error) => cleanupErrors.push(`session cleanup failed ${sessionId}: ${error.message}`));
  }
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (cleanupErrors.length) {
    console.error(`cleanup warnings: ${cleanupErrors.join("; ")}`);
    process.exitCode = process.exitCode || 1;
  }
}

async function saveSession(baseUrl, sessionId, evidence, memoryStatus) {
  return postJson(`${baseUrl}/api/sessions`, {
    session_id: sessionId,
    title: `Phase 6 memory smoke ${memoryStatus}`,
    evidence,
    report: {
      summary: "Phase 6 memory smoke report",
      primary_diagnosis: {
        title: "Phase 6 memory smoke",
        confidence: evidence.confidence.max_report_confidence,
        evidence: []
      }
    },
    memory_status: memoryStatus,
    feedback: {
      shot_result: "synthetic",
      coach_helpfulness: "smoke_test",
      note: "Generated by scripts/phase6-memory-smoke.mjs"
    }
  });
}

function makeEvidence({ userId, sessionId, memoryStatus, timingMs, trunkDeg, confidence, signalStatus = "candidate" }) {
  return {
    schema_version: "evidence_packet.v1",
    session_id: sessionId,
    user_profile: {
      user_id: userId,
      goal: "Phase 6 trend smoke"
    },
    session: {
      shot_type: "phase6_memory_smoke",
      camera_view: "side",
      fps: 60,
      analysis_mode: "synthetic_memory_contract",
      video_duration_ms: 1000
    },
    video_context: {
      file_name: `${sessionId}.mp4`,
      camera_view: "side",
      fps: 60
    },
    metrics: {
      ball_lift_knee_delta_ms: timingMs,
      trunk_lean_release_deg: trunkDeg
    },
    matched_signals: [
      {
        signal_id: "coordination.ball_lift_lower_body_timing",
        name: "起球-下肢启动时序",
        status: signalStatus,
        confidence,
        frame: 128,
        evidence_metric_ids: ["ball_lift_knee_delta_ms"]
      }
    ],
    confidence: {
      overall: confidence,
      max_report_confidence: confidence >= 0.82 ? "high" : confidence >= 0.65 ? "medium" : "low"
    },
    pipeline_status: {
      memory_layer: "sqlite_sessions"
    },
    memory_status: memoryStatus
  };
}

async function deleteSession(baseUrl, sessionId) {
  const response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!response.ok) fail(`delete failed: ${sessionId} ${response.status} ${await response.text()}`);
  return response.json();
}

async function startServer(port) {
  const child = spawn(nodeBin, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DEEPSEEK_API_KEY: "",
      YOLO_COMMAND: "",
      RTMPOSE_COMMAND: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code && code !== 130 && code !== 1) {
      console.error(`server exited with code ${code}: ${stderr.slice(-1000)}`);
    }
  });
  try {
    await waitForServer(`http://localhost:${port}`);
    return child;
  } catch (error) {
    child.kill("SIGINT");
    await new Promise((resolve) => child.once("exit", resolve));
    throw error;
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/privacy-boundary`);
      if (response.ok) return;
    } catch {
      // Retry until the server is ready.
    }
    await delay(250);
  }
  fail(`server did not become ready: ${baseUrl}`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase6 memory smoke failed: ${message}`);
}
