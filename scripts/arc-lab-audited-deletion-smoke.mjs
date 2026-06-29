import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateArcLabAuditedDeletionFlow } from "../server/arcLabIdentityStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const validation = validateArcLabAuditedDeletionFlow();

assert.equal(validation.ok, true, validation.errors.join("\n"));
assert.equal(validation.boundaries.organization_scoped_delete, true);
assert.equal(validation.boundaries.video_session_athlete_data_actions_are_separate, true);
assert.equal(validation.boundaries.deleted_video_unplayable, true);
assert.equal(validation.boundaries.deleted_session_hidden_from_student, true);
assert.equal(validation.boundaries.deleted_athlete_access_blocked, true);
assert(validation.checked_tables.includes("audit_events"));

const html = await readFile(path.join(root, "app", "arc-lab.html"), "utf8");
const js = await readFile(path.join(root, "app", "arc-lab.js"), "utf8");
assert(html.includes("删除审计"));
assert(html.includes("videoDeleteForm"));
assert(html.includes("sessionDeleteForm"));
assert(html.includes("athleteDataDeleteForm"));
assert(js.includes("/api/arc-lab/videos/delete"));
assert(js.includes("/api/arc-lab/sessions/delete"));
assert(js.includes("/api/arc-lab/athlete-data/delete"));

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "", YOLO_COMMAND: "", RTMPOSE_COMMAND: "" },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer();
  const coach = await postJson("/api/arc-lab/coaches/login", { phone: "13800000000" });
  const athlete = await postJson("/api/arc-lab/athletes", { coach_id: coach.profile.id, display_name: "删除审计学生" });
  const lesson = await postJson("/api/arc-lab/coach-lessons", {
    coach_id: coach.profile.id,
    athlete_id: athlete.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: 120,
    file_name: "audited-delete.mp4"
  });
  await postJson("/api/arc-lab/coach-reviews/publish", {
    coach_id: coach.profile.id,
    session_id: lesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    coach_feedback_text: "教练确认后发布删除审计样例。"
  });
  const outsider = await postJson("/api/arc-lab/coaches/login", { phone: "13700000000" });
  const denied = await fetch(`${baseUrl}/api/arc-lab/videos/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coach_id: outsider.profile.id, video_asset_id: lesson.video_asset.id })
  });
  assert.equal(denied.status, 403);
  const videoDeleted = await postJson("/api/arc-lab/videos/delete", {
    coach_id: coach.profile.id,
    video_asset_id: lesson.video_asset.id
  });
  assert.equal(videoDeleted.action, "video_deleted");
  assert.equal(videoDeleted.session_deleted, false);
  const review = await getJson(`/api/arc-lab/coach-review?coach_id=${encodeURIComponent(coach.profile.id)}&athlete_id=${encodeURIComponent(athlete.athlete.id)}&session_id=${encodeURIComponent(lesson.session.id)}`);
  assert.equal(review.player.playback_available, false);
  const sessionDeleted = await postJson("/api/arc-lab/sessions/delete", {
    coach_id: coach.profile.id,
    session_id: lesson.session.id
  });
  assert.equal(sessionDeleted.action, "session_deleted");
  assert.equal(sessionDeleted.video_asset_deleted, false);
  const lessons = await getJson(`/api/arc-lab/coach-lessons?coach_id=${encodeURIComponent(coach.profile.id)}`);
  assert.equal(lessons.lessons.length, 0);
  const athleteDeleted = await postJson("/api/arc-lab/athlete-data/delete", {
    coach_id: coach.profile.id,
    athlete_id: athlete.athlete.id
  });
  assert.equal(athleteDeleted.action, "athlete_data_deleted");
  assert.equal(athleteDeleted.boundaries.separate_from_single_video_delete, true);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "arc_lab_audited_deletion_smoke.v1",
    source_contract: "local_coach_os_separate_soft_delete_actions_with_audit_events",
    checked_tables: validation.checked_tables,
    boundaries: validation.boundaries,
    api_checks: {
      cross_organization_delete_denied: true,
      video_delete_keeps_session: true,
      session_delete_keeps_video_action_separate: true,
      athlete_data_delete_separate: true,
      ui_controls_present: true
    }
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await onceExit(server);
}

async function postJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (response.status !== 200) {
    assert.fail(`${pathname} ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (response.status !== 200) {
    assert.fail(`${pathname} ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/arc-lab-platform`);
      if (response.ok) return;
    } catch {
      // Server process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Arc Lab audited deletion smoke server did not start");
}

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
