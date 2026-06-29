import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArcLabPlatformMvp, validateArcLabPlatformMvp } from "../server/arcLabPlatform.mjs";
import { validateArcLabNextPlatformScaffold } from "../server/arcLabNextPlatformScaffold.mjs";
import { validateArcLabSupabaseProductionContract } from "../server/arcLabSupabaseProduction.mjs";
import {
  validateArcLabCoachLessonUploadFlow,
  validateArcLabCoachHomeFlow,
  validateArcLabCoachReviewPublishFlow,
  validateArcLabAuditedDeletionFlow,
  validateArcLabHomeworkReviewFlow,
  validateArcLabIdentityInviteFlow,
  validateArcLabLiveTrendFlow,
  validateArcLabStudentKnowledgeDirectoryFlow,
  validateArcLabStudentKnowledgeUsageFlow,
  validateArcLabStudentFeedbackFlow
} from "../server/arcLabIdentityStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const knowledgeBase = JSON.parse(await readFile(path.join(root, "distillation/douyin-shooting-coach/outputs/knowledge_base.json"), "utf8"));

const validation = validateArcLabPlatformMvp(knowledgeBase);
assert.equal(validation.ok, true, validation.errors.join("\n"));
const nextPlatformValidation = await validateArcLabNextPlatformScaffold(root);
assert.equal(nextPlatformValidation.ok, true, nextPlatformValidation.errors.join("\n"));
const identityValidation = validateArcLabIdentityInviteFlow();
assert.equal(identityValidation.ok, true, identityValidation.errors.join("\n"));
const lessonValidation = validateArcLabCoachLessonUploadFlow();
assert.equal(lessonValidation.ok, true, lessonValidation.errors.join("\n"));
const coachHomeValidation = validateArcLabCoachHomeFlow();
assert.equal(coachHomeValidation.ok, true, coachHomeValidation.errors.join("\n"));
const publishValidation = validateArcLabCoachReviewPublishFlow();
assert.equal(publishValidation.ok, true, publishValidation.errors.join("\n"));
const studentFeedbackValidation = validateArcLabStudentFeedbackFlow();
assert.equal(studentFeedbackValidation.ok, true, studentFeedbackValidation.errors.join("\n"));
const homeworkReviewValidation = validateArcLabHomeworkReviewFlow();
assert.equal(homeworkReviewValidation.ok, true, homeworkReviewValidation.errors.join("\n"));
const liveTrendValidation = validateArcLabLiveTrendFlow();
assert.equal(liveTrendValidation.ok, true, liveTrendValidation.errors.join("\n"));
const studentKnowledgeUsageValidation = validateArcLabStudentKnowledgeUsageFlow(knowledgeBase);
assert.equal(studentKnowledgeUsageValidation.ok, true, studentKnowledgeUsageValidation.errors.join("\n"));
const studentKnowledgeDirectoryValidation = validateArcLabStudentKnowledgeDirectoryFlow(knowledgeBase);
assert.equal(studentKnowledgeDirectoryValidation.ok, true, studentKnowledgeDirectoryValidation.errors.join("\n"));
const auditedDeletionValidation = validateArcLabAuditedDeletionFlow();
assert.equal(auditedDeletionValidation.ok, true, auditedDeletionValidation.errors.join("\n"));

const blueprint = buildArcLabPlatformMvp({ knowledgeBase });
assert.equal(blueprint.product_positioning.ai_final_diagnosis_allowed, false);
assert.equal(blueprint.product_positioning.analysis_lab_preserved, true);
assert.equal(blueprint.identity_access.coach_first_login_creates_default_organization, true);
assert.equal(blueprint.coach_session_review.ai_draft.student_visible, false);
assert.equal(blueprint.coach_session_review.published_feedback.student_visible, true);
assert.equal(blueprint.student_experience.feedback_result.hidden_from_student.includes("ai_raw_draft"), true);
assert.equal(blueprint.student_experience.knowledge_assistant.personal_diagnosis_refusal.answer_type, "boundary_refusal");
assert.equal(blueprint.homework.wrong_view_policy.record_role, "supplemental_wrong_view_record");
assert.equal(blueprint.trend.snapshot.student_view.recent_sessions.length, 3);
assert.equal(blueprint.data_model.tables.length, 26);
assert.equal(nextPlatformValidation.summary.live_supabase_project_verified, false);
assert.equal(nextPlatformValidation.summary.next_runtime_verified_by_static_check, false);

const html = await readFile(path.join(root, "app", "arc-lab.html"), "utf8");
const css = await readFile(path.join(root, "app", "arc-lab.css"), "utf8");
const js = await readFile(path.join(root, "app", "arc-lab.js"), "utf8");
const analysisLabHtml = await readFile(path.join(root, "app", "index.html"), "utf8");
const pwaManifest = await readFile(path.join(root, "app", "arc-lab.webmanifest"), "utf8");
const serviceWorker = await readFile(path.join(root, "app", "arc-lab-sw.js"), "utf8");
const migration = await readFile(path.join(root, "supabase", "migrations", "0001_arc_lab_mvp_schema.sql"), "utf8");
const analysisEngine = await readFile(path.join(root, "packages", "analysis-engine", "index.mjs"), "utf8");
const supabaseProductionValidation = validateArcLabSupabaseProductionContract(migration);
assert.equal(supabaseProductionValidation.ok, true, supabaseProductionValidation.errors.join("\n"));

assert(html.includes("Arc Lab"));
assert(html.includes("/arc-lab.js"));
assert(html.includes("/arc-lab.webmanifest"));
assert(html.includes('name="theme-color"'));
assert(html.includes("analysis-lab-frame"));
assert(html.includes("embedded=arc-lab-review"));
assert(html.includes("AI 投篮实验室学生课堂复盘"));
assert(html.includes("AI 投篮实验室学生复测上传"));
assert(analysisLabHtml.includes('id="videoInput"'));
assert(analysisLabHtml.includes('id="pairedVideoInput"'));
assert(analysisLabHtml.includes('id="analyzeButton"'));
assert(analysisLabHtml.includes('id="exportFrameButton"'));
assert(analysisLabHtml.includes('id="keyframes"'));
assert(css.includes("@media (max-width: 560px)"));
assert(js.includes("/api/arc-lab-platform"));
assert(js.includes("serviceWorker"));
assert(js.includes("/api/arc-lab/coaches/login"));
assert(js.includes("/api/arc-lab/athletes"));
assert(js.includes("/api/arc-lab/coach-athlete-flags/priority"));
assert(js.includes("/bind-phone"));
assert(js.includes("/api/arc-lab/coach-lessons"));
assert(js.includes("/api/arc-lab/coach-reviews/publish"));
assert(js.includes("/api/arc-lab/student-results"));
assert(js.includes("/api/arc-lab/student-homework"));
assert(js.includes("/api/arc-lab/coach-homework/review"));
assert(js.includes("/api/arc-lab/coach-trends"));
assert(js.includes("/api/arc-lab/student-trends"));
assert(js.includes("/api/arc-lab/student-knowledge-assistant"));
assert(js.includes("/api/arc-lab/student-knowledge-directory"));
assert(js.includes("/api/arc-lab/videos/delete"));
assert(js.includes("/api/arc-lab/sessions/delete"));
assert(js.includes("/api/arc-lab/athlete-data/delete"));
assert(js.includes("/api/arc-lab-deployment-readiness"));
assert(html.includes("上传线下课视频"));
assert(html.includes("确认并发布反馈"));
assert(html.includes("查看教练反馈"));
assert(html.includes("上传作业/复测视频"));
assert(html.includes("复盘作业与训练效果"));
assert(html.includes("确认学生趋势说明"));
assert(html.includes("训练知识目录"));
assert(html.includes("删除审计"));
assert(js.includes("部署门禁"));
assert(migration.includes("create table if not exists training_sessions"));
assert(migration.includes("bound_profile_id uuid references profiles(id)"));
assert(migration.includes("enable row level security"));
assert(migration.includes("arc_lab_mark_video_deleted"));
assert(migration.includes("storage.buckets"));
assert(analysisEngine.includes("buildEvidencePacket"));
assert(html.includes("复盘队列和草稿箱"));
assert(html.includes("完整复用原 AI 投篮实验室"));
assert(js.includes("今日 AI 解释"));
assert(JSON.parse(pwaManifest).display === "standalone");
assert(serviceWorker.includes("SHELL_ASSETS"));
assert(!serviceWorker.includes("/api/arc-lab"));

const port = await getFreePort();
const server = spawn(nodeBin, ["server/index.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ARC_LAB_LIVE_SUPABASE_VERIFY: "",
    ARC_LAB_LIVE_RLS_VERIFY: "",
    ARC_LAB_LIVE_STORAGE_RLS_VERIFY: "",
    ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY: "",
    DEEPSEEK_API_KEY: "",
    YOLO_COMMAND: "",
    RTMPOSE_COMMAND: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(port);
  const api = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-platform`);
  assert.equal(api.schema_version, "arc_lab_platform_mvp_blueprint.v1");
  assert.equal(api.product_positioning.ai_final_diagnosis_allowed, false);
  assert.equal(api.student_experience.knowledge_assistant.personal_diagnosis_refusal.answer_type, "boundary_refusal");
  assert.equal(api.productionization.storage_boundary.object_key_prefix, "organization_id/athlete_id/session_or_video_path");
  const supabaseProduction = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-supabase-production`);
  assert.equal(supabaseProduction.validation.ok, true);
  assert.equal(supabaseProduction.rls_enabled_table_count, 26);
  assert.equal(supabaseProduction.storage_bucket, "arc-lab-videos");
  const deploymentReadiness = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-deployment-readiness`);
  assert.equal(deploymentReadiness.ok, true);
  assert.equal(deploymentReadiness.live_supabase_project_verified, false);
  assert.equal(deploymentReadiness.boundaries.live_external_services_contacted, false);
  assert.equal(deploymentReadiness.environment.secret_values_exposed, false);
  const supabaseLive = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-supabase-live-verification`);
  assert.equal(supabaseLive.verification_status, "skipped_not_requested");
  assert.equal(supabaseLive.live_external_services_contacted, false);
  const supabaseRlsLive = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-supabase-rls-live-verification`);
  assert.equal(supabaseRlsLive.verification_status, "skipped_not_requested");
  assert.equal(supabaseRlsLive.live_external_services_contacted, false);
  assert.equal(supabaseRlsLive.live_rls_policy_effect_verified, false);
  const supabaseStorageLive = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-supabase-storage-live-verification`);
  assert.equal(supabaseStorageLive.verification_status, "skipped_not_requested");
  assert.equal(supabaseStorageLive.live_external_services_contacted, false);
  assert.equal(supabaseStorageLive.live_storage_read_policy_verified, false);
  const supabaseStorageLifecycle = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab-supabase-storage-lifecycle-verification`);
  assert.equal(supabaseStorageLifecycle.verification_status, "skipped_not_requested");
  assert.equal(supabaseStorageLifecycle.live_external_services_contacted, false);
  assert.equal(supabaseStorageLifecycle.live_storage_lifecycle_verified, false);
  const manifestResponse = await fetch(`http://127.0.0.1:${port}/arc-lab.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert(manifestResponse.headers.get("content-type").includes("application/manifest+json"));
  assert.equal((await manifestResponse.json()).start_url, "/arc-lab.html");
  const options = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/options`);
  assert(options.problem_tags.some((item) => item.id === "hand_leads_before_lower_body"));
  assert(options.camera_views.some((item) => item.id === "side"));
  assert(options.shot_types.some((item) => item.id === "spot_up"));
  const login = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coaches/login`, { phone: "13800000000" });
  assert.equal(login.ok, true);
  assert.equal(login.auth_mode, "local_mock_phone_login");
  assert.equal(login.organization.created_by, login.profile.id);
  const athlete = await postJson(`http://127.0.0.1:${port}/api/arc-lab/athletes`, {
    coach_id: login.profile.id,
    display_name: "小明"
  });
  assert.equal(athlete.ok, true);
  assert.equal(athlete.athlete.organization_id, login.organization.id);
  assert.equal(athlete.coach_athlete_relation.organization_id, login.organization.id);
  assert(athlete.invite_link.includes(athlete.invite.token));
  const priority = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coach-athlete-flags/priority`, {
    coach_id: login.profile.id,
    athlete_id: athlete.athlete.id,
    active: true
  });
  assert.equal(priority.priority_student, true);
  const lesson = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coach-lessons`, {
    coach_id: login.profile.id,
    athlete_id: athlete.athlete.id,
    initial_problem_tag_id: "hand_leads_before_lower_body",
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: 120,
    file_name: "lesson-side-spot-up.mp4"
  });
  assert.equal(lesson.ok, true);
  assert.equal(lesson.session.source_type, "coach_lesson");
  assert.equal(lesson.session.uploaded_by_role, "coach");
  assert.equal(lesson.session.organization_id, login.organization.id);
  assert.equal(lesson.video_asset.camera_view, "side");
  assert.equal(lesson.video_asset.shot_type, "spot_up");
  assert.equal(lesson.evidence_packet.packet_json.source_type, "coach_lesson");
  assert.equal(lesson.evidence_packet.packet_json.trend_key_preview, "coach_lesson:side:spot_up:hand_leads_before_lower_body");
  assert.equal(lesson.ai_report_draft.student_visible, false);
  assert.equal(lesson.session_problem_tag.status, "suggested");
  const published = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coach-reviews/publish`, {
    coach_id: login.profile.id,
    session_id: lesson.session.id,
    primary_problem_tag_id: "hand_leads_before_lower_body",
    secondary_problem_tag_ids: ["lower_body_ball_transfer_disconnect", "low_release_point"],
    coach_feedback_text: "主问题是起球早于下肢启动，本周先重建脚带手顺序。",
    coach_note: "教练结合侧面视角证据和课堂上下文后确认。"
  });
  assert.equal(published.ok, true);
  assert.equal(published.coach_feedback.final_feedback_json.source_contract, "coach_confirmed_feedback_student_source_of_truth");
  assert.equal(published.published_feedback.student_visible, true);
  assert.equal(published.published_feedback.source_of_truth, "coach_feedback");
  assert.equal(published.ai_report_draft_student_visible, false);
  assert.equal(published.training_plan_steps.length, 3);
  assert.equal(published.confirmed_problem_tags.filter((item) => item.role === "primary").length, 1);
  assert.equal(published.confirmed_problem_tags.filter((item) => item.role === "secondary").length, 2);
  assert(published.published_feedback.hidden_from_student.includes("ai_draft_json"));
  const lessons = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/coach-lessons?coach_id=${encodeURIComponent(login.profile.id)}`);
  assert.equal(lessons.lessons.length, 1);
  assert.equal(lessons.boundaries.homework_excluded, true);
  assert.equal(lessons.lessons[0].session.status, "coach_feedback_published");
  assert.equal(lessons.lessons[0].coach_feedback.final_feedback_json.source_contract, "coach_confirmed_feedback_student_source_of_truth");
  const invite = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/invites/${athlete.invite.token}`);
  assert.equal(invite.status, "active");
  assert.equal(invite.student_visible_ai_draft, false);
  const binding = await postJson(`http://127.0.0.1:${port}/api/arc-lab/invites/${athlete.invite.token}/bind-phone`, { phone: "13900000000" });
  assert.equal(binding.ok, true);
  assert.equal(binding.invite.status, "phone_bound");
  assert(binding.student_home.hidden_from_student.includes("ai_report_drafts"));
  const knowledgeDirectory = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/student-knowledge-directory?token=${encodeURIComponent(athlete.invite.token)}`);
  assert.equal(knowledgeDirectory.ok, true);
  assert(knowledgeDirectory.directory.articles.length >= 9);
  assert.equal(knowledgeDirectory.boundaries.saves_student_question, false);
  assert(knowledgeDirectory.directory.hidden_from_student.includes("source_card_id"));
  for (const article of knowledgeDirectory.directory.articles) {
    assert(!Object.hasOwn(article, "source_card_id"));
    assert(!Object.hasOwn(article, "source_url"));
  }
  const studentResults = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/student-results?token=${encodeURIComponent(athlete.invite.token)}`);
  assert.equal(studentResults.ok, true);
  assert.equal(studentResults.student_final_source_of_truth, "coach_feedback");
  assert.equal(studentResults.results.length, 1);
  assert.equal(studentResults.results[0].source_of_truth, "coach_feedback");
  assert.equal(studentResults.results[0].session.source_type, "coach_lesson");
  assert.equal(studentResults.results[0].session.status, "coach_feedback_published");
  assert.equal(studentResults.results[0].coach_feedback.final_feedback_json.source_contract, "coach_confirmed_feedback_student_source_of_truth");
  assert.equal(studentResults.results[0].training_plan_steps.length, 3);
  assert(studentResults.hidden_from_student.includes("ai_report_drafts"));
  assert(studentResults.hidden_from_student.includes("coach_edit_diff_json"));
  const studentResultPayload = JSON.stringify(studentResults);
  assert(!studentResultPayload.includes('"ai_draft_json"'));
  assert(!studentResultPayload.includes('"diff_json"'));
  const wrongHomework = await postJson(`http://127.0.0.1:${port}/api/arc-lab/student-homework`, {
    token: athlete.invite.token,
    training_task_id: published.training_task.id,
    camera_view: "front",
    shot_type: "spot_up",
    trend_metric_value: 130,
    file_name: "homework-front.mp4"
  });
  assert.equal(wrongHomework.ok, true);
  assert.equal(wrongHomework.view_policy.counts_as_requested_homework_completion, false);
  assert.equal(wrongHomework.session.status, "supplemental_wrong_view_record");
  assert.equal(wrongHomework.training_task.status, "completed_by_self_report");
  const correctHomework = await postJson(`http://127.0.0.1:${port}/api/arc-lab/student-homework`, {
    token: athlete.invite.token,
    training_task_id: published.training_task.id,
    camera_view: "side",
    shot_type: "spot_up",
    trend_metric_value: 96,
    file_name: "homework-side.mp4"
  });
  assert.equal(correctHomework.ok, true);
  assert.equal(correctHomework.view_policy.counts_as_requested_homework_completion, true);
  assert.equal(correctHomework.training_task.status, "retest_uploaded");
  assert.equal(correctHomework.evidence_packet.packet_json.trend_key_preview, "athlete_homework:side:spot_up:hand_leads_before_lower_body");
  assert.equal(correctHomework.student_visible_ai_draft, false);
  const coachHomework = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/coach-homework?coach_id=${encodeURIComponent(login.profile.id)}`);
  assert.equal(coachHomework.homework.length, 2);
  assert.equal(coachHomework.boundaries.wrong_view_saved_as_supplemental, true);
  const homeworkReview = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coach-homework/review`, {
    coach_id: login.profile.id,
    session_id: correctHomework.session.id,
    coach_note: "继续观察迁移。",
    step_effectiveness: [
      { step_type: "correction", effectiveness_status: "effective" },
      { step_type: "transfer", effectiveness_status: "watching" }
    ]
  });
  assert.equal(homeworkReview.ok, true);
  assert.equal(homeworkReview.counts_as_requested_homework_completion, true);
  assert.equal(homeworkReview.training_task.status, "watching");
  assert.equal(homeworkReview.training_plan_step_results.length, 3);
  const coachTrends = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/coach-trends?coach_id=${encodeURIComponent(login.profile.id)}&athlete_id=${encodeURIComponent(athlete.athlete.id)}`);
  assert.equal(coachTrends.ok, true);
  assert.equal(coachTrends.trend.tracks.length, 3);
  const studentTrendBefore = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/student-trends?token=${encodeURIComponent(athlete.invite.token)}`);
  assert.equal(studentTrendBefore.ok, true);
  assert.equal(studentTrendBefore.trend.interpretive_explanation.status, "hidden_until_coach_confirmation");
  const trendExplanation = await postJson(`http://127.0.0.1:${port}/api/arc-lab/coach-trends/explanation`, {
    coach_id: login.profile.id,
    athlete_id: athlete.athlete.id,
    trend_key: studentTrendBefore.trend.current_track_key,
    text: "教练确认后，学生才可以看到这条趋势说明。"
  });
  assert.equal(trendExplanation.ok, true);
  const studentTrendAfter = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/student-trends?token=${encodeURIComponent(athlete.invite.token)}`);
  assert.equal(studentTrendAfter.trend.interpretive_explanation.status, "coach_confirmed");
  assert(!JSON.stringify(studentTrendAfter).includes("draft_json"));
  const knowledgeAnswer = await postJson(`http://127.0.0.1:${port}/api/arc-lab/student-knowledge-assistant`, {
    token: athlete.invite.token,
    question: "低位到高位起球怎么做？"
  });
  assert.equal(knowledgeAnswer.ok, true);
  assert.equal(knowledgeAnswer.answer.answer_type, "general_training_explanation_draft");
  assert.equal(knowledgeAnswer.usage.ai_answer_count, 1);
  assert.equal(knowledgeAnswer.usage.saves_student_question, false);
  assert(!JSON.stringify(knowledgeAnswer.usage).includes("低位到高位起球"));
  const personalKnowledgeAnswer = await postJson(`http://127.0.0.1:${port}/api/arc-lab/student-knowledge-assistant`, {
    token: athlete.invite.token,
    question: "我的投篮视频有什么问题？"
  });
  assert.equal(personalKnowledgeAnswer.ok, false);
  assert.equal(personalKnowledgeAnswer.answer.answer_type, "boundary_refusal");
  assert.equal(personalKnowledgeAnswer.usage.ai_answer_count, 1);
  let rateLimitedKnowledgeAnswer;
  for (let index = 0; index < 20; index += 1) {
    rateLimitedKnowledgeAnswer = await postJson(`http://127.0.0.1:${port}/api/arc-lab/student-knowledge-assistant`, {
      token: athlete.invite.token,
      question: "怎么拍 side view 投篮视频？"
    });
  }
  assert.equal(rateLimitedKnowledgeAnswer.ok, false);
  assert.equal(rateLimitedKnowledgeAnswer.answer.answer_type, "rate_limited");
  assert.equal(rateLimitedKnowledgeAnswer.usage.ai_answer_count, 20);
  const home = await fetchJson(`http://127.0.0.1:${port}/api/arc-lab/coach-home?coach_id=${encodeURIComponent(login.profile.id)}`);
  assert.equal(home.athletes.length, 1);
  assert.equal(home.athletes[0].priority_student, true);
  assert.equal(home.review_queue.length, 1);
  assert.equal(home.review_queue[0].session_id, wrongHomework.session.id);
  assert.equal(home.review_queue[0].confirmed_main_problem_visible_before_review, false);
  assert(home.notifications.some((item) => item.reason === "retest_uploaded" && item.level === "important"));
  assert.equal(home.boundaries.cross_organization_sharing_in_mvp, false);
  const page = await fetchText(`http://127.0.0.1:${port}/arc-lab.html`);
  assert(page.includes("复盘队列和草稿箱"));
  assert(page.includes("完整复用原 AI 投篮实验室"));
  assert(page.includes("本地身份与邀请"));
  assert(page.includes("查看教练反馈"));
  assert(page.includes("上传作业/复测视频"));
} finally {
  server.kill("SIGTERM");
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_platform_smoke.v1",
  source_contract: "coach_platform_student_platform_local_blueprint",
  checked: {
    platform_validation: true,
    api_endpoint: true,
    static_page: true,
    identity_invite_api: true,
    coach_lesson_upload_api: true,
    coach_review_publish_api: true,
    student_feedback_api: true,
    student_homework_upload_api: true,
    coach_homework_review_api: true,
    coach_home_priority_queue_api: true,
    student_knowledge_usage_api: true,
    student_knowledge_directory_api: true,
    audited_deletion_api: true,
    deployment_readiness_api: true,
    supabase_live_verification_api: true,
    supabase_rls_live_verification_api: true,
    supabase_storage_live_verification_api: true,
    supabase_storage_lifecycle_verification_api: true,
    pwa_shell: true,
    next_platform_scaffold: true,
    supabase_production_contract: true,
    supabase_schema_draft: true,
    analysis_engine_bridge: true,
    data_model_tables: blueprint.data_model.tables.length
  },
  boundaries: [
    "analysis_lab_preserved",
    "coach_feedback_student_source_of_truth",
    "coach_local_phone_login_default_organization",
    "student_invite_phone_binding",
    "coach_lesson_video_asset_evidence_packet",
    "coach_confirmed_feedback_published",
    "student_sees_only_coach_published_feedback",
    "wrong_view_homework_saved_supplemental_not_completion",
    "coach_reviews_drill_effectiveness",
    "coach_home_retest_first_priority_queue_notifications",
    "student_knowledge_daily_usage_counter_no_question_storage",
    "student_full_clean_knowledge_directory_no_raw_sources",
    "arc_lab_local_video_session_athlete_data_audited_deletion",
    "arc_lab_deployment_readiness_gate_no_live_claim",
    "arc_lab_live_verification_gates_default_no_external_contact",
    "arc_lab_mobile_first_pwa_shell",
    "arc_lab_next_platform_scaffold_with_separate_runtime_and_browser_smokes",
    "supabase_rls_storage_audited_deletion_contract",
    "ai_draft_hidden_from_student",
    "student_knowledge_no_personal_diagnosis",
    "lesson_homework_view_shot_problem_tracks_separated",
    "supabase_rls_storage_deletion_contract_present"
  ]
}, null, 2));

async function fetchJson(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.text();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForServer(port) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/arc-lab-platform`);
      if (response.ok) return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("server did not become ready");
}

async function getFreePort() {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
