import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "", YOLO_COMMAND: "", RTMPOSE_COMMAND: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uploadId = "";

try {
  await waitForServer();
  const form = new FormData();
  form.append("video", new Blob([await readFile(path.join(root, "data", "synthetic_ball.mp4"))], { type: "video/mp4" }), "review-synthetic.mp4");
  const uploadResponse = await fetch(`${baseUrl}/api/upload-video`, { method: "POST", body: form });
  assert.equal(uploadResponse.status, 200);
  const upload = await uploadResponse.json();
  uploadId = upload.upload_id;

  const coach = await postJson("/api/arc-lab/coaches/login", { phone: "13800000000" });
  const athlete = await postJson("/api/arc-lab/athletes", { coach_id: coach.profile.id, display_name: "复盘学生" });
  const sessionIds = [];
  for (const metric of [145, 121, 96]) {
    const lesson = await postJson("/api/arc-lab/coach-lessons", {
      coach_id: coach.profile.id,
      athlete_id: athlete.athlete.id,
      initial_problem_tag_id: "hand_leads_before_lower_body",
      camera_view: "side",
      shot_type: "spot_up",
      trend_metric_value: metric,
      file_name: upload.file_name,
      upload_id: upload.upload_id
    });
    sessionIds.push(lesson.session.id);
    await postJson("/api/arc-lab/coach-reviews/publish", {
      coach_id: coach.profile.id,
      session_id: lesson.session.id,
      primary_problem_tag_id: "hand_leads_before_lower_body",
      coach_feedback_text: "教练确认后发布课堂复盘。"
    });
  }

  const coachReview = await getJson(`/api/arc-lab/coach-review?coach_id=${encodeURIComponent(coach.profile.id)}&athlete_id=${encodeURIComponent(athlete.athlete.id)}&session_id=${encodeURIComponent(sessionIds[2])}`);
  assert.equal(coachReview.ok, true);
  assert.equal(coachReview.audience, "coach");
  assert.equal(coachReview.player.playback_available, true);
  assert.equal(coachReview.player.full_playback_default, true);
  assert.deepEqual(coachReview.stages.map((stage) => stage.label), ["举球启动", "下肢启动", "出手", "随球跟随"]);
  assert.equal(coachReview.comparison.sessions.length, 3);
  assert.equal(coachReview.boundaries.ai_draft_included, false);
  const coachVideo = await fetch(`${baseUrl}${coachReview.player.playback_url}`, { headers: { range: "bytes=0-255" } });
  assert.equal(coachVideo.status, 206);
  assert(coachVideo.headers.get("content-type").includes("video/mp4"));
  assert.equal((await coachVideo.arrayBuffer()).byteLength, 256);
  const coachSuffixVideo = await fetch(`${baseUrl}${coachReview.player.playback_url}`, { headers: { range: "bytes=-32" } });
  assert.equal(coachSuffixVideo.status, 206);
  assert.equal((await coachSuffixVideo.arrayBuffer()).byteLength, 32);
  assert.match(coachSuffixVideo.headers.get("content-range") || "", /^bytes \d+-\d+\/\d+$/);
  const coachOpenEndedVideo = await fetch(`${baseUrl}${coachReview.player.playback_url}`, { headers: { range: "bytes=32-" } });
  assert.equal(coachOpenEndedVideo.status, 206);
  assert.match(coachOpenEndedVideo.headers.get("content-range") || "", /^bytes 32-\d+\/\d+$/);
  assert(Number(coachOpenEndedVideo.headers.get("content-length") || 0) > 32);
  await coachOpenEndedVideo.arrayBuffer();
  const coachInvalidRangeVideo = await fetch(`${baseUrl}${coachReview.player.playback_url}`, { headers: { range: "bytes=999999999-1000000000" } });
  assert.equal(coachInvalidRangeVideo.status, 416);
  assert.equal(coachInvalidRangeVideo.headers.get("accept-ranges"), "bytes");
  assert.match(coachInvalidRangeVideo.headers.get("content-range") || "", /^bytes \*\/\d+$/);

  const outsider = await postJson("/api/arc-lab/coaches/login", { phone: "13700000000" });
  const denied = await fetch(`${baseUrl}/api/arc-lab/coach-review?coach_id=${encodeURIComponent(outsider.profile.id)}&athlete_id=${encodeURIComponent(athlete.athlete.id)}`);
  assert.equal(denied.status, 403);

  await postJson(`/api/arc-lab/invites/${encodeURIComponent(athlete.invite.token)}/bind-phone`, { phone: "13900000000" });
  const studentReview = await getJson(`/api/arc-lab/student-review?token=${encodeURIComponent(athlete.invite.token)}&session_id=${encodeURIComponent(sessionIds[2])}`);
  assert.equal(studentReview.ok, true);
  assert.equal(studentReview.audience, "student");
  assert.equal(studentReview.comparison.sessions.length, 3);
  assert.equal(studentReview.boundaries.student_only_receives_published_lessons, true);
  assert(!JSON.stringify(studentReview).includes("ai_draft_json"));
  assert(!JSON.stringify(studentReview).includes("diff_json"));
  const studentVideo = await fetch(`${baseUrl}${studentReview.player.playback_url}`);
  assert.equal(studentVideo.status, 200);
  assert((await studentVideo.arrayBuffer()).byteLength > 0);

  console.log(JSON.stringify({
    ok: true,
    schema_version: "arc_lab_review_smoke.v1",
    source_contract: "local_uploaded_video_authorized_coach_student_review_experience",
    checks: {
      local_upload_attached: true,
      coach_video_playback: true,
      coach_video_range: {
        normal: 206,
        suffix: coachSuffixVideo.status,
        open_ended: coachOpenEndedVideo.status,
        invalid: coachInvalidRangeVideo.status,
        invalid_accept_ranges: coachInvalidRangeVideo.headers.get("accept-ranges")
      },
      student_published_video_playback: true,
      default_stage_switching: true,
      recent_three_session_comparison: true,
      ai_draft_hidden_from_student: true,
      cross_organization_access_denied: true
    }
  }, null, 2));
} finally {
  if (uploadId) await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" }).catch(() => null);
  server.kill("SIGTERM");
  await onceExit(server);
}

async function postJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200);
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
  throw new Error("Arc Lab review smoke server did not start");
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
