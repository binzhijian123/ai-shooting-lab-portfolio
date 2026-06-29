import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";
import { retrieveVectorRag } from "./vectorRagIndex.mjs";
import { buildGroundedPortfolioAnswer } from "./localRagIndex.mjs";
import { runLoRAInference } from "./loraCoachApi.mjs";
import { adapterCapabilities, readVideoMetadata, runAdapterHealthChecks, runModelAdapters } from "./modelAdapters.mjs";
import {
  cleanupUploadFiles,
  deleteUpload,
  deleteUploadFile,
  listUploadFiles,
  resolveUpload,
  saveMultipartUpload,
  updateUploadMetadata
} from "./uploadStore.mjs";
import {
  buildCoachUserPrompt,
  coachReportSystemPrompt,
  localCoachReport,
  validateCoachReport
} from "./promptPolicy.mjs";
import { buildReportContracts, normalizeEvidencePacketForReport } from "./reportContracts.mjs";
import { validateSampleManifestPolicy } from "./sampleManifestPolicy.mjs";
import { auditAuthorizedSampleReadiness } from "./sampleReadinessPolicy.mjs";
import { summarizeCreatorAngleMapping, summarizeScoringRegistry } from "./scoringArchitecture.mjs";
import { buildMultiAngleEvidencePacket } from "./multiAngleEvidence.mjs";
import { buildEvidencePacket } from "./visionPipeline.mjs";
import { applyAlphaTestBoundary, validateAlphaTestRequest } from "./alphaTestPolicy.mjs";
import { ARC_LAB_MVP_CONTRACT, summarizeArcLabContract, validateArcLabContract } from "./arcLabContracts.mjs";
import { summarizeArcLabWorkflowContract, validateArcLabWorkflowContract } from "./arcLabWorkflow.mjs";
import { summarizeArcLabTrendContract, validateArcLabTrendContract } from "./arcLabTrends.mjs";
import { summarizeArcLabKnowledgeAssistantContract, validateArcLabKnowledgeAssistantContract } from "./arcLabKnowledgeAssistant.mjs";
import { enrichStudentKnowledgeRagResponse } from "./knowledgeRag.mjs";
import { buildArcLabPlatformMvp, summarizeArcLabPlatformMvp, validateArcLabPlatformMvp } from "./arcLabPlatform.mjs";
import {
  summarizeArcLabNextPlatformScaffold,
  validateArcLabNextPlatformScaffold
} from "./arcLabNextPlatformScaffold.mjs";
import {
  summarizeArcLabSupabaseProductionContract,
  validateArcLabSupabaseProductionContract
} from "./arcLabSupabaseProduction.mjs";
import {
  auditArcLabDeploymentReadiness,
  validateArcLabDeploymentReadinessGate
} from "./arcLabDeploymentReadiness.mjs";
import {
  auditArcLabSupabaseLiveVerification,
  validateArcLabSupabaseLiveVerificationGate
} from "./arcLabSupabaseLiveVerification.mjs";
import {
  auditArcLabSupabaseRlsLiveVerification,
  validateArcLabSupabaseRlsLiveVerificationGate
} from "./arcLabSupabaseRlsLiveVerification.mjs";
import {
  auditArcLabSupabaseStorageLiveVerification,
  validateArcLabSupabaseStorageLiveVerificationGate
} from "./arcLabSupabaseStorageLiveVerification.mjs";
import {
  auditArcLabSupabaseStorageLifecycleVerification,
  validateArcLabSupabaseStorageLifecycleVerificationGate
} from "./arcLabSupabaseStorageLifecycleVerification.mjs";
import {
  createArcLabIdentityStore,
  getArcLabLessonUploadOptions,
  validateArcLabCoachLessonUploadFlow,
  validateArcLabCoachHomeFlow,
  validateArcLabCoachReviewPublishFlow,
  validateArcLabAuditedDeletionFlow,
  validateArcLabHomeworkReviewFlow,
  validateArcLabIdentityInviteFlow,
  validateArcLabLiveTrendFlow,
  validateArcLabReviewExperienceFlow,
  validateArcLabStudentKnowledgeUsageFlow,
  validateArcLabStudentKnowledgeDirectoryFlow,
  validateArcLabStudentFeedbackFlow
} from "./arcLabIdentityStore.mjs";
import {
  buildAngleKnowledgeRetrieval,
  summarizeBodyAngleProblemMapping
} from "./angleKnowledgeRetrieval.mjs";

let buildMemorySummary;
let deleteTrainingSession;
let deleteUserTrainingSessions;
let initMemoryStore;
let readSessions;
let saveTrainingSession;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "app");
const distillationDir = path.join(root, "distillation", "douyin-shooting-coach");
const knowledgeBasePath = path.join(distillationDir, "outputs", "knowledge_base.json");
const scoringRegistryPath = path.join(distillationDir, "outputs", "scoring_registry.json");
const creatorAngleMappingPath = path.join(distillationDir, "outputs", "creator_angle_mapping.json");
const bodyAngleProblemMappingPath = path.join(distillationDir, "outputs", "body_angle_problem_mapping.json");
const dataDir = path.join(root, "data");
const uploadDir = path.join(dataDir, "uploads");
const sampleManifestPath = path.join(dataDir, "sample_manifest.json");
const arcLabSupabaseMigrationPath = path.join(root, "supabase", "migrations", "0001_arc_lab_mvp_schema.sql");
await loadLocalEnv(path.join(root, ".env"));
await loadLocalEnv(path.join(distillationDir, ".env"));
const port = Number(process.env.PORT || 4173);
const arcLabIdentityStore = createArcLabIdentityStore();

if (process.argv.includes("--check")) {
  const check = await runAcceptanceCheck();
  console.log(JSON.stringify(check, null, 2));
  process.exit(check.ok ? 0 : 1);
}

({ buildMemorySummary, deleteTrainingSession, deleteUserTrainingSessions, initMemoryStore, readSessions, saveTrainingSession } = await import("./memoryStore.mjs"));
await initMemoryStore(dataDir);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname === "/api/knowledge-summary") {
      return sendJson(response, await getKnowledgeSummary());
    }
    if (url.pathname === "/api/scoring-architecture") {
      return sendJson(response, {
        scoring_registry: summarizeScoringRegistry(await loadScoringRegistry()),
        creator_angle_mapping: summarizeCreatorAngleMapping(await loadCreatorAngleMapping()),
        body_angle_problem_mapping: summarizeBodyAngleProblemMapping(await loadBodyAngleProblemMapping())
      });
    }
    if (url.pathname === "/api/creator-angle-mapping") {
      return sendJson(response, summarizeCreatorAngleMapping(await loadCreatorAngleMapping()));
    }
    if (url.pathname === "/api/body-angle-problem-mapping" && request.method === "GET") {
      return sendJson(response, summarizeBodyAngleProblemMapping(await loadBodyAngleProblemMapping()));
    }
    if (url.pathname === "/api/arc-lab-mvp-contract" && request.method === "GET") {
      return sendJson(response, {
        ...summarizeArcLabContract(),
        validation: validateArcLabContract()
      });
    }
    if (url.pathname === "/api/arc-lab-workflow-contract" && request.method === "GET") {
      return sendJson(response, {
        ...summarizeArcLabWorkflowContract(),
        validation: validateArcLabWorkflowContract()
      });
    }
    if (url.pathname === "/api/arc-lab-trend-contract" && request.method === "GET") {
      return sendJson(response, {
        ...summarizeArcLabTrendContract(),
        validation: validateArcLabTrendContract()
      });
    }
    if (url.pathname === "/api/arc-lab-knowledge-assistant-contract" && request.method === "GET") {
      return sendJson(response, {
        ...summarizeArcLabKnowledgeAssistantContract(),
        validation: validateArcLabKnowledgeAssistantContract(await loadKnowledgeBase())
      });
    }
    if (url.pathname === "/api/arc-lab-platform" && request.method === "GET") {
      return sendJson(response, buildArcLabPlatformMvp({ knowledgeBase: await loadKnowledgeBase() }));
    }
    if (url.pathname === "/api/arc-lab-supabase-production" && request.method === "GET") {
      const sql = await readFile(arcLabSupabaseMigrationPath, "utf8");
      return sendJson(response, {
        ...summarizeArcLabSupabaseProductionContract(sql),
        validation: validateArcLabSupabaseProductionContract(sql)
      });
    }
    if (url.pathname === "/api/arc-lab-deployment-readiness" && request.method === "GET") {
      return sendJson(response, auditArcLabDeploymentReadiness({
        env: process.env,
        sql: await readFile(arcLabSupabaseMigrationPath, "utf8")
      }));
    }
    if (url.pathname === "/api/arc-lab-supabase-live-verification" && request.method === "GET") {
      return sendJson(response, await auditArcLabSupabaseLiveVerification({ env: process.env }));
    }
    if (url.pathname === "/api/arc-lab-supabase-rls-live-verification" && request.method === "GET") {
      return sendJson(response, await auditArcLabSupabaseRlsLiveVerification({ env: process.env }));
    }
    if (url.pathname === "/api/arc-lab-supabase-storage-live-verification" && request.method === "GET") {
      return sendJson(response, await auditArcLabSupabaseStorageLiveVerification({ env: process.env }));
    }
    if (url.pathname === "/api/arc-lab-supabase-storage-lifecycle-verification" && request.method === "GET") {
      return sendJson(response, await auditArcLabSupabaseStorageLifecycleVerification({ env: process.env }));
    }
    if (url.pathname === "/api/arc-lab/options" && request.method === "GET") {
      return sendJson(response, getArcLabLessonUploadOptions());
    }
    if (url.pathname === "/api/arc-lab/coaches/login" && request.method === "POST") {
      const result = arcLabIdentityStore.loginCoach(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-home" && request.method === "GET") {
      const result = arcLabIdentityStore.getCoachHome(url.searchParams.get("coach_id"));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/athletes" && request.method === "POST") {
      const result = arcLabIdentityStore.addAthlete(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-athlete-flags/priority" && request.method === "POST") {
      const result = arcLabIdentityStore.setCoachAthletePriority(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname.startsWith("/api/arc-lab/invites/") && request.method === "GET") {
      const token = decodeURIComponent(url.pathname.slice("/api/arc-lab/invites/".length));
      const result = arcLabIdentityStore.getInvite(token);
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname.startsWith("/api/arc-lab/invites/") && url.pathname.endsWith("/bind-phone") && request.method === "POST") {
      const token = decodeURIComponent(url.pathname.slice("/api/arc-lab/invites/".length, -"/bind-phone".length));
      const result = arcLabIdentityStore.bindInvitePhone({ ...(await readJson(request)), token });
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-lessons" && request.method === "GET") {
      const result = arcLabIdentityStore.listCoachLessons(url.searchParams.get("coach_id"));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-lessons" && request.method === "POST") {
      const result = arcLabIdentityStore.uploadCoachLesson(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-reviews/publish" && request.method === "POST") {
      const result = arcLabIdentityStore.publishCoachReview(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/student-results" && request.method === "GET") {
      const result = arcLabIdentityStore.getStudentResultsByInvite(url.searchParams.get("token"));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/student-knowledge-directory" && request.method === "GET") {
      const result = arcLabIdentityStore.getStudentKnowledgeDirectoryByInvite({
        token: url.searchParams.get("token"),
        knowledgeBase: await loadKnowledgeBase()
      });
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-review" && request.method === "GET") {
      const result = arcLabIdentityStore.getCoachReviewExperience({
        coach_id: url.searchParams.get("coach_id"),
        athlete_id: url.searchParams.get("athlete_id"),
        session_id: url.searchParams.get("session_id")
      });
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/student-review" && request.method === "GET") {
      const result = arcLabIdentityStore.getStudentReviewExperienceByInvite({
        token: url.searchParams.get("token"),
        session_id: url.searchParams.get("session_id")
      });
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-videos" && request.method === "GET") {
      const result = arcLabIdentityStore.getCoachReviewVideo({
        coach_id: url.searchParams.get("coach_id"),
        session_id: url.searchParams.get("session_id")
      });
      if (!result.ok) return sendJson(response, result, result.status || 400);
      return serveStoredUpload(resolveUpload(result.upload_id), request, response);
    }
    if (url.pathname === "/api/arc-lab/student-videos" && request.method === "GET") {
      const result = arcLabIdentityStore.getStudentReviewVideo({
        token: url.searchParams.get("token"),
        session_id: url.searchParams.get("session_id")
      });
      if (!result.ok) return sendJson(response, result, result.status || 400);
      return serveStoredUpload(resolveUpload(result.upload_id), request, response);
    }
    if (url.pathname === "/api/arc-lab/student-homework" && request.method === "POST") {
      const result = arcLabIdentityStore.uploadStudentHomework(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-homework" && request.method === "GET") {
      const result = arcLabIdentityStore.listCoachHomework(url.searchParams.get("coach_id"));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-homework/review" && request.method === "POST") {
      const result = arcLabIdentityStore.reviewCoachHomework(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-trends" && request.method === "GET") {
      const result = arcLabIdentityStore.getCoachTrends({
        coach_id: url.searchParams.get("coach_id"),
        athlete_id: url.searchParams.get("athlete_id"),
        current_trend_key: url.searchParams.get("trend_key")
      });
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/coach-trends/explanation" && request.method === "POST") {
      const result = arcLabIdentityStore.confirmCoachTrendExplanation(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/student-trends" && request.method === "GET") {
      const result = arcLabIdentityStore.getStudentTrendsByInvite(url.searchParams.get("token"));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/student-knowledge-assistant" && request.method === "POST") {
      const body = await readJson(request);
      const result = arcLabIdentityStore.answerStudentKnowledgeQuestion({
        ...body,
        knowledgeBase: await loadKnowledgeBase()
      });
      const groundedResult = await enrichStudentKnowledgeRagResponse({ result, question: body.question });
      return sendJson(response, groundedResult, groundedResult.ok ? 200 : groundedResult.status || 400);
    }
    if (url.pathname === "/api/arc-lab/videos/delete" && request.method === "POST") {
      const result = arcLabIdentityStore.deleteCoachVideoAsset(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/sessions/delete" && request.method === "POST") {
      const result = arcLabIdentityStore.deleteCoachSession(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/arc-lab/athlete-data/delete" && request.method === "POST") {
      const result = arcLabIdentityStore.deleteCoachAthleteData(await readJson(request));
      return sendJson(response, result, result.ok ? 200 : result.status || 400);
    }
    if (url.pathname === "/api/angle-knowledge-retrieval" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, buildAngleKnowledgeRetrieval({
        mapping: await loadBodyAngleProblemMapping(),
        knowledgeBase: await loadKnowledgeBase(),
        observations: Array.isArray(body.observations) ? body.observations : [],
        context: body.context || {}
      }));
    }
    if (url.pathname === "/api/pipeline-capabilities") {
      return sendJson(response, {
        browser_pose: {
          engine: "MediaPipe PoseLandmarker",
          status: "client_runtime",
          evidence_field: "pose_samples"
        },
        adapters: adapterCapabilities(),
        health_endpoint: "/api/model-health",
        memory: { engine: "SQLite", status: "enabled" },
        coach: { engine: "DeepSeek JSON mode", status: process.env.DEEPSEEK_API_KEY ? "configured" : "local_fallback" }
      });
    }
    if (url.pathname === "/api/model-health") {
      return sendJson(response, await runAdapterHealthChecks());
    }
    if (url.pathname === "/api/samples" && request.method === "GET") {
      return sendJson(response, await listAuthorizedSamples());
    }
    if (url.pathname === "/api/authorized-sample-readiness" && request.method === "GET") {
      return sendJson(response, await getAuthorizedSampleReadiness());
    }
    if (url.pathname.startsWith("/api/sample-videos/") && request.method === "GET") {
      const sampleId = decodeURIComponent(url.pathname.slice("/api/sample-videos/".length));
      return serveSampleVideo(sampleId, request, response);
    }
    if (url.pathname === "/api/privacy-boundary") {
      return sendJson(response, await getPrivacyBoundary());
    }
    if (url.pathname === "/api/privacy-export" && request.method === "GET") {
      return sendJson(response, await buildPrivacyExport(url.searchParams.get("user_id") || "local_user_001"));
    }
    if (url.pathname === "/api/upload-files" && request.method === "GET") {
      return sendJson(response, await listUploadFiles(uploadDir));
    }
    if (url.pathname === "/api/upload-files/cleanup" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, await cleanupUploadFiles(uploadDir, body));
    }
    if (url.pathname === "/api/upload-video" && request.method === "POST") {
      const upload = await saveMultipartUpload(request, uploadDir);
      const record = resolveUpload(upload.upload_id);
      const metadata = await readVideoMetadata(record?.path);
      return sendJson(response, updateUploadMetadata(upload.upload_id, metadata) || { ...upload, metadata });
    }
    if (url.pathname.startsWith("/api/uploads/") && request.method === "DELETE") {
      const uploadId = decodeURIComponent(url.pathname.slice("/api/uploads/".length));
      const deleted = await deleteUpload(uploadId, uploadDir);
      return sendJson(response, deleted, deleted.ok ? 200 : 404);
    }
    if (url.pathname.startsWith("/api/upload-files/") && request.method === "DELETE") {
      const fileName = decodeURIComponent(url.pathname.slice("/api/upload-files/".length));
      const deleted = await deleteUploadFile(fileName, uploadDir);
      return sendJson(response, deleted, deleted.ok ? 200 : deleted.error === "upload_file_not_found" ? 404 : 400);
    }
    if (url.pathname === "/api/analyze-video" && request.method === "POST") {
      const body = await readJson(request);
      const upload = resolveUpload(body.upload_id);
      const sample = !upload && body.sample_id
        ? await resolveAuthorizedSample(body.sample_id, "local_analysis")
        : null;
      const knowledgeBase = await loadKnowledgeBase();
      const scoringRegistry = await loadScoringRegistry();
      const creatorAngleMapping = await loadCreatorAngleMapping();
      const memorySummary = buildMemorySummary(body.user_id || "local_user_001");
      const [modelAdapterOutputs, modelHealth] = await Promise.all([
        runModelAdapters({ ...body, video_path: upload?.path || sample?.absolutePath || null }),
        runAdapterHealthChecks()
      ]);
      return sendJson(response, buildSingleAngleEvidence({
        body: sample ? enrichBodyFromSample(body, sample) : body,
        upload,
        sample,
        knowledgeBase,
        scoringRegistry,
        creatorAngleMapping,
        memorySummary,
        modelHealth,
        modelAdapterOutputs
      }));
    }
    if (url.pathname === "/api/authorized-alpha-analysis" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, await runAuthorizedAlphaAnalysis(body));
    }
    if (url.pathname === "/api/analyze-multi-angle" && request.method === "POST") {
      const body = await readJson(request);
      const knowledgeBase = await loadKnowledgeBase();
      const scoringRegistry = await loadScoringRegistry();
      const creatorAngleMapping = await loadCreatorAngleMapping();
      const memorySummary = buildMemorySummary(body.user_id || "local_user_001");
      const modelHealth = await runAdapterHealthChecks();
      const inputs = Array.isArray(body.videos) ? body.videos : [];
      const evidencePackets = [];
      for (const input of inputs) {
        if (input.evidence_packet?.schema_version === "evidence_packet.v1") {
          const validationErrors = validateEvidencePacket(input.evidence_packet);
          if (validationErrors.length) {
            return sendJson(response, {
              ok: false,
              error: "evidence_packet_schema_invalid",
              expected_schema_version: "evidence_packet.v1",
              received_schema_version: input.evidence_packet.schema_version,
              validation_errors: validationErrors
            }, 400);
          }
          const packetView = input.evidence_packet.session?.camera_view || input.evidence_packet.video_context?.camera_view || null;
          if (input.camera_view && packetView && packetView !== input.camera_view) {
            return sendJson(response, {
              ok: false,
              error: "evidence_packet_camera_view_mismatch",
              camera_view: input.camera_view,
              evidence_packet_camera_view: packetView
            }, 400);
          }
          evidencePackets.push(input.evidence_packet);
        } else if (Object.prototype.hasOwnProperty.call(input, "evidence_packet") && input.evidence_packet != null) {
          return sendJson(response, {
            ok: false,
            error: "evidence_packet_schema_invalid",
            expected_schema_version: "evidence_packet.v1",
            received_schema_version: input.evidence_packet?.schema_version || null
          }, 400);
        } else {
          const upload = resolveUpload(input.upload_id);
          const modelAdapterOutputs = await runModelAdapters({ ...input, video_path: upload?.path || null });
          evidencePackets.push(buildSingleAngleEvidence({
            body: { ...body, ...input },
            upload,
            knowledgeBase,
            scoringRegistry,
            creatorAngleMapping,
            memorySummary,
            modelHealth,
            modelAdapterOutputs
          }));
        }
      }
      return sendJson(response, buildMultiAngleEvidencePacket({
        sessionGroupId: body.session_group_id,
        shotType: body.shot_type,
        inputs,
        evidencePackets
      }));
    }
    if (url.pathname === "/api/coach-report" && request.method === "POST") {
      const packet = await readJson(request);
      return sendJson(response, await createCoachReport(packet));
    }
    if (url.pathname === "/api/sessions" && request.method === "GET") {
      return sendJson(response, readSessions());
    }
    if (url.pathname.startsWith("/api/users/") && url.pathname.endsWith("/sessions") && request.method === "DELETE") {
      const userId = decodeURIComponent(url.pathname.slice("/api/users/".length, -"/sessions".length));
      const deleted = deleteUserTrainingSessions(userId);
      return sendJson(response, { ...deleted, memory_summary: buildMemorySummary(userId), sessions: readSessions() }, deleted.ok ? 200 : 400);
    }
    if (url.pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const sessionId = decodeURIComponent(url.pathname.slice("/api/sessions/".length));
      const deleted = deleteTrainingSession(sessionId);
      return sendJson(response, { ...deleted, sessions: readSessions() }, deleted.ok ? 200 : 404);
    }
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      const body = await readJson(request);
      const saved = saveTrainingSession(body);
      return sendJson(response, { ...saved, sessions: readSessions() });
    }
    if (url.pathname === "/api/memory-summary" && request.method === "GET") {
      return sendJson(response, buildMemorySummary(url.searchParams.get("user_id") || "local_user_001"));
    }
    if (url.pathname === "/api/local-rag-coach" && request.method === "POST") {
      return sendJson(response, await handleLocalRagCoach(request));
    }
    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "internal_error", message: error.message }, 500);
  }
});

async function handleLocalRagCoach(request) {
  const body = await readJson(request);
  const question = (body.question || "").trim();
  if (!question) {
    return { ok: false, error: "missing_question", message: "请提供 question 字段" };
  }

  // 1. 加载向量索引
  let indexPath = path.join(root, "data", "rag", "vector_index.json");
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    return { ok: false, error: "vector_index_not_found", message: "向量索引不存在，请先运行 node scripts/build-vector-rag-index.mjs" };
  }

  // 2. 向量 RAG 检索
  const matches = await retrieveVectorRag(question, index, { root, topK: 5 });
  const retrievedCards = matches.map((m) => ({
    slug: m.slug,
    score: m.score,
    title: m.title,
    summary: m.summary
  }));

  // 3. 检查是否是 out-of-domain
  if (!matches.length) {
    const isPersonal = /(我的|诊断|帮我看看|帮我分析|你觉得我|适合我吗|我应该怎么改|帮我查|你看我|适合我吗|帮我检查|给我看看|我的投篮|我是不是)/.test(question);
    return {
      ok: true,
      schema_version: "local_rag_coach_response.v1",
      question,
      retrieval: { method: index.source_contract, top_k: 0, matches: [] },
      answer: isPersonal
        ? { answer: "个人视频或个人动作的最终诊断需要教练结合视频证据确认。这里可以解释通用训练知识、拍摄要求或知识库里的训练概念。", cited_slugs: [], confidence: "low", boundary: "personal_diagnosis_refusal" }
        : { answer: "当前知识库没有直接相关依据", cited_slugs: [], confidence: "low", boundary: "knowledge_insufficient" },
      model_source: "heuristic_fallback",
      usage: { prompt_tokens: 0, generation_tokens: 0 }
    };
  }

  // 3b. 即使有 RAG 匹配，如果问题是关于"我"的个人诊断，强制拒答
  const isPersonalWithRag = /(帮我看看|你觉得我|帮我分析|我的投篮|适合我吗|我是不是|给我看看|帮我检查)/.test(question);
  if (isPersonalWithRag) {
    return {
      ok: true,
      schema_version: "local_rag_coach_response.v1",
      question,
      retrieval: { method: index.source_contract, top_k: matches.length, matches: retrievedCards },
      answer: {
        answer: "个人视频或个人动作的最终诊断需要教练结合视频证据确认。这里可以解释通用训练知识、拍摄要求或知识库里的训练概念。",
        cited_slugs: [],
        confidence: "low",
        boundary: "personal_diagnosis_refusal"
      },
      model_source: "heuristic_fallback",
      usage: { prompt_tokens: 0, generation_tokens: 0 }
    };
  }

  // 4. 构建 prompt
  const topCards = matches.slice(0, 3);
  const cardsJson = JSON.stringify(topCards.map((m) => ({
    slug: m.slug,
    title: m.title,
    summary: m.summary,
    diagnosis_rules: m.diagnosis_rules || [],
    repair_actions: m.repair_actions || []
  })), null, 2);

  const fullPrompt = `问题：${question}\nRAG 知识卡：\n${cardsJson}\n请只依据这些知识卡输出 JSON。`;

  // 5. LoRA 模型推理
  const { generation, usage } = await runLoRAInference(fullPrompt, {
    maxTokens: body.maxTokens || 350
  });

  // 6. 解析 JSON 输出
  let parsed;
  try {
    parsed = JSON.parse(generation);
  } catch {
    // 如果模型输出不是合法 JSON，退回构建 grounded answer
    const fallback = buildGroundedPortfolioAnswer(question, matches);
    return {
      ok: true,
      schema_version: "local_rag_coach_response.v1",
      question,
      retrieval: { method: index.source_contract, top_k: matches.length, matches: retrievedCards },
      answer: {
        answer: fallback.answer || "请参考以上知识卡相关内容。",
        cited_slugs: fallback.cited_slugs || [],
        confidence: "low",
        boundary: "general_training_only"
      },
      raw_generation: generation,
      model_source: "lora_fallback",
      usage
    };
  }

  // 7. 后处理：修复模型输出的常见问题
  const validSlugs = new Set(matches.map((m) => m.slug));
  const maxScore = matches.length > 0 ? matches[0].score : 0;
  const modelBoundary = parsed.boundary || "general_training_only";

  // 7a. 过滤 cited_slugs: 只保留真实匹配的 slug
  const filteredSlugs = (Array.isArray(parsed.cited_slugs) ? parsed.cited_slugs : [])
    .filter((s) => validSlugs.has(s));

  // 7b. confidence 修复
  // 模型有时输出 "general_training_only" 作为 confidence 值（应为 "high" / "medium" / "low"）
  let safeConfidence = parsed.confidence || "low";
  if (safeConfidence === "general_training_only" || safeConfidence === "knowledge_insufficient" || safeConfidence === "personal_diagnosis_refusal" || !["high", "medium", "low"].includes(safeConfidence)) {
    // 根据 RAG score 推断 confidence
    if (maxScore >= 0.45) safeConfidence = "high";
    else if (maxScore >= 0.35) safeConfidence = "medium";
    else safeConfidence = "low";
  }

  // 7c. answer 去重：去除重复的句子
  let cleanAnswer = (parsed.answer || "").trim();
  cleanAnswer = deduplicateSentences(cleanAnswer);

  // 7d. 确保 boundary 是合法值
  const VALID_BOUNDARIES = new Set(["general_training_only", "personal_diagnosis_refusal", "knowledge_insufficient"]);
  const safeBoundary = VALID_BOUNDARIES.has(modelBoundary) ? modelBoundary : "general_training_only";

  return {
    ok: true,
    schema_version: "local_rag_coach_response.v1",
    question,
    retrieval: { method: index.source_contract, top_k: matches.length, matches: retrievedCards },
    answer: {
      answer: cleanAnswer || buildGroundedPortfolioAnswer(question, matches).answer,
      cited_slugs: filteredSlugs.length > 0 ? filteredSlugs : matches.slice(0, 3).map((m) => m.slug),
      confidence: safeConfidence,
      boundary: safeBoundary
    },
    model_source: "lora",
    usage
  };
}

/**
 * 去重：如果一句话连续出现两次以上，只保留一次。
 */
function deduplicateSentences(text) {
  if (!text || text.length < 10) return text;
  // 按句末标点拆分
  const parts = text.split(/(?<=[\u3002\uff01\uff1f\uff1b\n])/);
  if (parts.length <= 2) return text;
  
  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length >= 8 && seen.has(trimmed)) continue;
    if (trimmed.length >= 8) seen.add(trimmed);
    unique.push(part);
  }
  return unique.join("").trim();
}

server.listen(port, () => {
  console.log(`AI Shooting Lab running at http://localhost:${port}`);
});

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(urlPath, response) {
  const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;
  const requestedPath = path.normalize(decodeURIComponent(normalizedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(appDir, requestedPath);
  if (!filePath.startsWith(appDir) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  response.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  response.end(await readFile(filePath));
}

async function loadKnowledgeBase() {
  return JSON.parse(await readFile(knowledgeBasePath, "utf8"));
}

async function loadScoringRegistry() {
  return JSON.parse(await readFile(scoringRegistryPath, "utf8"));
}

async function loadCreatorAngleMapping() {
  return JSON.parse(await readFile(creatorAngleMappingPath, "utf8"));
}

async function loadBodyAngleProblemMapping() {
  return JSON.parse(await readFile(bodyAngleProblemMappingPath, "utf8"));
}

function buildSingleAngleEvidence({ body, upload, sample, knowledgeBase, scoringRegistry, creatorAngleMapping, memorySummary, modelHealth, modelAdapterOutputs }) {
  return buildEvidencePacket({
    ...body,
    video_path: upload?.path || null,
    uploaded_video: upload ? {
      upload_id: upload.upload_id,
      file_name: upload.file_name,
      bytes: upload.bytes,
      content_type: upload.content_type,
      metadata: upload.metadata || null
    } : null,
    sample_video: sample ? publicSample(sample) : null,
    memory_summary: memorySummary,
    model_health: modelHealth,
    model_adapter_outputs: modelAdapterOutputs
  }, knowledgeBase, scoringRegistry, creatorAngleMapping);
}

async function runAuthorizedAlphaAnalysis(body) {
  const upload = resolveUpload(body.upload_id);
  const policy = validateAlphaTestRequest(body, upload);
  if (!policy.ok) {
    return {
      schema_version: "authorized_alpha_analysis.v1",
      source_contract: "local_authorized_alpha_test_not_diagnosis",
      status: "rejected",
      authorization: policy,
      boundaries: alphaAnalysisBoundaries()
    };
  }
  const knowledgeBase = await loadKnowledgeBase();
  const scoringRegistry = await loadScoringRegistry();
  const creatorAngleMapping = await loadCreatorAngleMapping();
  const userId = body.user_id || "alpha_tester_local";
  const memorySummary = buildMemorySummary(userId);
  const [modelAdapterOutputs, modelHealth] = await Promise.all([
    runModelAdapters({ ...body, video_path: upload.path }),
    runAdapterHealthChecks()
  ]);
  const evidence = applyAlphaTestBoundary(buildSingleAngleEvidence({
    body: {
      ...body,
      user_id: userId,
      sample_source_type: "authorized_alpha_test_local_upload",
      training_goal: body.training_goal || "授权 Alpha 本地流程验收"
    },
    upload,
    knowledgeBase,
    scoringRegistry,
    creatorAngleMapping,
    memorySummary,
    modelHealth,
    modelAdapterOutputs
  }), policy);
  const coach = await createCoachReport(evidence);
  const sessionId = body.session_id || `authorized_alpha_${Date.now()}`;
  const saved = saveTrainingSession({
    session_id: sessionId,
    title: body.title || `Authorized alpha: ${upload.file_name}`,
    evidence,
    report: coach.report,
    memory_status: "short_term_review",
    feedback: {
      shot_result: "alpha_test",
      coach_helpfulness: "requires_human_review",
      note: "Authorized local alpha analysis; review-only and not player diagnosis."
    }
  });
  return {
    schema_version: "authorized_alpha_analysis.v1",
    source_contract: "local_authorized_alpha_test_not_diagnosis",
    status: "review_only",
    authorization: policy,
    evidence_packet: evidence,
    coach_report: coach,
    saved_session: saved,
    boundaries: alphaAnalysisBoundaries()
  };
}

function alphaAnalysisBoundaries() {
  return [
    "local_only",
    "authorized_upload_required",
    "short_term_review_only",
    "not_for_player_diagnosis",
    "no_public_showcase",
    "no_external_distribution",
    "no_cloud_storage",
    "no_model_training"
  ];
}

async function runAcceptanceCheck() {
  const knowledgeBase = await loadKnowledgeBase();
  const scoringRegistry = await loadScoringRegistry();
  const creatorAngleMapping = await loadCreatorAngleMapping();
  const bodyAngleProblemMapping = await loadBodyAngleProblemMapping();
  const knowledgeSummary = summarizeKnowledgeBase(knowledgeBase);
  const scoringSummary = summarizeScoringRegistry(scoringRegistry);
  const creatorAngleSummary = summarizeCreatorAngleMapping(creatorAngleMapping);
  const bodyAngleProblemSummary = summarizeBodyAngleProblemMapping(bodyAngleProblemMapping);
  const arcLabContract = validateArcLabContract(ARC_LAB_MVP_CONTRACT);
  const arcLabWorkflow = validateArcLabWorkflowContract();
  const arcLabTrend = validateArcLabTrendContract();
  const arcLabKnowledgeAssistant = validateArcLabKnowledgeAssistantContract(knowledgeBase);
  const arcLabPlatform = validateArcLabPlatformMvp(knowledgeBase);
  const arcLabNextPlatformScaffold = await validateArcLabNextPlatformScaffold(root);
  const arcLabSupabaseSql = await readFile(arcLabSupabaseMigrationPath, "utf8");
  const arcLabSupabaseProduction = validateArcLabSupabaseProductionContract(arcLabSupabaseSql);
  const arcLabDeploymentReadiness = validateArcLabDeploymentReadinessGate(auditArcLabDeploymentReadiness({
    env: process.env,
    sql: arcLabSupabaseSql
  }));
  const arcLabSupabaseLiveVerification = validateArcLabSupabaseLiveVerificationGate(
    await auditArcLabSupabaseLiveVerification({ env: {} })
  );
  const arcLabSupabaseRlsLiveVerification = validateArcLabSupabaseRlsLiveVerificationGate(
    await auditArcLabSupabaseRlsLiveVerification({ env: {} })
  );
  const arcLabSupabaseStorageLiveVerification = validateArcLabSupabaseStorageLiveVerificationGate(
    await auditArcLabSupabaseStorageLiveVerification({ env: {} })
  );
  const arcLabSupabaseStorageLifecycleVerification = validateArcLabSupabaseStorageLifecycleVerificationGate(
    await auditArcLabSupabaseStorageLifecycleVerification({ env: {} })
  );
  const arcLabIdentityInvite = validateArcLabIdentityInviteFlow();
  const arcLabCoachLessonUpload = validateArcLabCoachLessonUploadFlow();
  const arcLabCoachHome = validateArcLabCoachHomeFlow();
  const arcLabCoachReviewPublish = validateArcLabCoachReviewPublishFlow();
  const arcLabStudentFeedback = validateArcLabStudentFeedbackFlow();
  const arcLabHomeworkReview = validateArcLabHomeworkReviewFlow();
  const arcLabReviewExperience = validateArcLabReviewExperienceFlow();
  const arcLabLiveTrend = validateArcLabLiveTrendFlow();
  const arcLabStudentKnowledgeUsage = validateArcLabStudentKnowledgeUsageFlow(knowledgeBase);
  const arcLabStudentKnowledgeDirectory = validateArcLabStudentKnowledgeDirectoryFlow(knowledgeBase);
  const arcLabAuditedDeletion = validateArcLabAuditedDeletionFlow();
  const sampleManifest = await loadSampleManifest();
  const sampleCheck = await validateSampleManifestPolicy(sampleManifest, root);
  const sampleReadiness = auditAuthorizedSampleReadiness(sampleManifest);
  const requiredDocs = [
    "Product-Spec.md",
    "Current-System-Audit.md",
    "Diagnosis-Framework.md",
    "Report-Schema.md",
    "Video-Analysis-Input-Contract.md",
    "Ball-Trajectory-Spec.md",
    "Scoring-Research-Plan.md",
    "Privacy-And-Data-Policy-Draft.md",
    "DEV-PLAN.md",
    "Goal-Backlog.md",
    "Acceptance-Baseline.md"
  ];
  const docs = requiredDocs.map((file) => ({
    file,
    exists: existsSync(path.join(root, file))
  }));
  const errors = [
    ...knowledgeSummary.errors,
    ...arcLabContract.errors.map((error) => `arc_lab_contract.${error}`),
    ...arcLabWorkflow.errors.map((error) => `arc_lab_workflow.${error}`),
    ...arcLabTrend.errors.map((error) => `arc_lab_trend.${error}`),
    ...arcLabKnowledgeAssistant.errors.map((error) => `arc_lab_knowledge_assistant.${error}`),
    ...arcLabPlatform.errors.map((error) => `arc_lab_platform.${error}`),
    ...arcLabNextPlatformScaffold.errors.map((error) => `arc_lab_next_platform_scaffold.${error}`),
    ...arcLabSupabaseProduction.errors.map((error) => `arc_lab_supabase_production.${error}`),
    ...arcLabDeploymentReadiness.errors.map((error) => `arc_lab_deployment_readiness.${error}`),
    ...arcLabSupabaseLiveVerification.errors.map((error) => `arc_lab_supabase_live_verification.${error}`),
    ...arcLabSupabaseRlsLiveVerification.errors.map((error) => `arc_lab_supabase_rls_live_verification.${error}`),
    ...arcLabSupabaseStorageLiveVerification.errors.map((error) => `arc_lab_supabase_storage_live_verification.${error}`),
    ...arcLabSupabaseStorageLifecycleVerification.errors.map((error) => `arc_lab_supabase_storage_lifecycle_verification.${error}`),
    ...arcLabIdentityInvite.errors.map((error) => `arc_lab_identity_invite.${error}`),
    ...arcLabCoachLessonUpload.errors.map((error) => `arc_lab_coach_lesson_upload.${error}`),
    ...arcLabCoachHome.errors.map((error) => `arc_lab_coach_home.${error}`),
    ...arcLabCoachReviewPublish.errors.map((error) => `arc_lab_coach_review_publish.${error}`),
    ...arcLabStudentFeedback.errors.map((error) => `arc_lab_student_feedback.${error}`),
    ...arcLabHomeworkReview.errors.map((error) => `arc_lab_homework_review.${error}`),
    ...arcLabReviewExperience.errors.map((error) => `arc_lab_review_experience.${error}`),
    ...arcLabLiveTrend.errors.map((error) => `arc_lab_live_trend.${error}`),
    ...arcLabStudentKnowledgeUsage.errors.map((error) => `arc_lab_student_knowledge_usage.${error}`),
    ...arcLabStudentKnowledgeDirectory.errors.map((error) => `arc_lab_student_knowledge_directory.${error}`),
    ...arcLabAuditedDeletion.errors.map((error) => `arc_lab_audited_deletion.${error}`),
    ...sampleCheck.errors,
    ...sampleReadiness.errors.map((error) => `authorized_sample_readiness.${error.sample_id}.${error.code}: ${error.message}`),
    ...docs.filter((doc) => !doc.exists).map((doc) => `missing required doc: ${doc.file}`)
  ];

  return {
    ok: errors.length === 0,
    checked: [
      "knowledge_base",
      "scoring_registry",
      "creator_angle_mapping",
      "body_angle_problem_mapping",
      "arc_lab_mvp_contract",
      "arc_lab_workflow_contract",
      "arc_lab_trend_contract",
      "arc_lab_knowledge_assistant_contract",
      "arc_lab_platform_mvp_blueprint",
      "arc_lab_next_platform_scaffold",
      "arc_lab_supabase_production_contract",
      "arc_lab_deployment_readiness_gate",
      "arc_lab_supabase_live_verification_gate",
      "arc_lab_supabase_rls_live_verification_gate",
      "arc_lab_supabase_storage_live_verification_gate",
      "arc_lab_supabase_storage_lifecycle_verification_gate",
      "arc_lab_identity_invite_flow",
      "arc_lab_coach_lesson_upload_flow",
      "arc_lab_coach_home_flow",
      "arc_lab_coach_review_publish_flow",
      "arc_lab_student_feedback_flow",
      "arc_lab_homework_review_flow",
      "arc_lab_review_experience_flow",
      "arc_lab_live_trend_flow",
      "arc_lab_student_knowledge_usage_flow",
      "arc_lab_student_knowledge_directory_flow",
      "arc_lab_audited_deletion_flow",
      "server_modules",
      "sample_manifest",
      "authorized_sample_readiness",
      "phase_0_5_docs",
      "adapter_configuration"
    ],
    knowledge_base: knowledgeSummary,
    scoring_registry: scoringSummary,
    creator_angle_mapping: creatorAngleSummary,
    body_angle_problem_mapping: bodyAngleProblemSummary,
    arc_lab_mvp_contract: arcLabContract.summary,
    arc_lab_workflow_contract: arcLabWorkflow.summary,
    arc_lab_trend_contract: arcLabTrend.summary,
    arc_lab_knowledge_assistant_contract: arcLabKnowledgeAssistant.summary,
    arc_lab_platform_mvp_blueprint: summarizeArcLabPlatformMvp(),
    arc_lab_next_platform_scaffold: summarizeArcLabNextPlatformScaffold(),
    arc_lab_supabase_production_contract: arcLabSupabaseProduction.summary,
    arc_lab_deployment_readiness_gate: {
      schema_version: arcLabDeploymentReadiness.schema_version,
      checked: arcLabDeploymentReadiness.checked,
      boundaries: arcLabDeploymentReadiness.boundaries
    },
    arc_lab_supabase_live_verification_gate: {
      schema_version: arcLabSupabaseLiveVerification.schema_version,
      checked: arcLabSupabaseLiveVerification.checked,
      boundaries: arcLabSupabaseLiveVerification.boundaries
    },
    arc_lab_supabase_rls_live_verification_gate: {
      schema_version: arcLabSupabaseRlsLiveVerification.schema_version,
      checked: arcLabSupabaseRlsLiveVerification.checked,
      boundaries: arcLabSupabaseRlsLiveVerification.boundaries
    },
    arc_lab_supabase_storage_live_verification_gate: {
      schema_version: arcLabSupabaseStorageLiveVerification.schema_version,
      checked: arcLabSupabaseStorageLiveVerification.checked,
      boundaries: arcLabSupabaseStorageLiveVerification.boundaries
    },
    arc_lab_supabase_storage_lifecycle_verification_gate: {
      schema_version: arcLabSupabaseStorageLifecycleVerification.schema_version,
      checked: arcLabSupabaseStorageLifecycleVerification.checked,
      boundaries: arcLabSupabaseStorageLifecycleVerification.boundaries
    },
    arc_lab_identity_invite_flow: {
      schema_version: arcLabIdentityInvite.schema_version,
      checked_tables: arcLabIdentityInvite.checked_tables,
      boundaries: arcLabIdentityInvite.boundaries
    },
    arc_lab_coach_lesson_upload_flow: {
      schema_version: arcLabCoachLessonUpload.schema_version,
      checked_tables: arcLabCoachLessonUpload.checked_tables,
      boundaries: arcLabCoachLessonUpload.boundaries
    },
    arc_lab_coach_home_flow: {
      schema_version: arcLabCoachHome.schema_version,
      checked_tables: arcLabCoachHome.checked_tables,
      boundaries: arcLabCoachHome.boundaries
    },
    arc_lab_coach_review_publish_flow: {
      schema_version: arcLabCoachReviewPublish.schema_version,
      checked_tables: arcLabCoachReviewPublish.checked_tables,
      boundaries: arcLabCoachReviewPublish.boundaries
    },
    arc_lab_student_feedback_flow: {
      schema_version: arcLabStudentFeedback.schema_version,
      checked_tables: arcLabStudentFeedback.checked_tables,
      boundaries: arcLabStudentFeedback.boundaries
    },
    arc_lab_homework_review_flow: {
      schema_version: arcLabHomeworkReview.schema_version,
      checked_tables: arcLabHomeworkReview.checked_tables,
      boundaries: arcLabHomeworkReview.boundaries
    },
    arc_lab_review_experience_flow: {
      schema_version: arcLabReviewExperience.schema_version,
      checked_tables: arcLabReviewExperience.checked_tables,
      boundaries: arcLabReviewExperience.boundaries
    },
    arc_lab_live_trend_flow: {
      schema_version: arcLabLiveTrend.schema_version,
      checked_tables: arcLabLiveTrend.checked_tables,
      boundaries: arcLabLiveTrend.boundaries
    },
    arc_lab_student_knowledge_usage_flow: {
      schema_version: arcLabStudentKnowledgeUsage.schema_version,
      checked_tables: arcLabStudentKnowledgeUsage.checked_tables,
      boundaries: arcLabStudentKnowledgeUsage.boundaries
    },
    arc_lab_student_knowledge_directory_flow: {
      schema_version: arcLabStudentKnowledgeDirectory.schema_version,
      checked_tables: arcLabStudentKnowledgeDirectory.checked_tables,
      boundaries: arcLabStudentKnowledgeDirectory.boundaries
    },
    arc_lab_audited_deletion_flow: {
      schema_version: arcLabAuditedDeletion.schema_version,
      checked_tables: arcLabAuditedDeletion.checked_tables,
      boundaries: arcLabAuditedDeletion.boundaries
    },
    sample_manifest: sampleCheck.summary,
    authorized_sample_readiness: {
      schema_version: sampleReadiness.schema_version,
      source_contract: sampleReadiness.source_contract,
      status: sampleReadiness.status,
      candidate_sample_count: sampleReadiness.candidate_sample_count,
      ready_sample_count: sampleReadiness.ready_sample_count,
      errors: sampleReadiness.errors
    },
    docs,
    adapters: adapterCapabilities(),
    privacy_boundary: sampleManifest.privacy_boundary || null,
    errors
  };
}

async function getPrivacyBoundary() {
  const manifest = await loadSampleManifest();
  const boundary = manifest.privacy_boundary || {};
  return {
    schema_version: "privacy_boundary.v1",
    storage: {
      raw_video: "local_uploads_only",
      sqlite_memory: "local_sqlite",
      cloud_sync: "not_implemented"
    },
    model_use: {
      report_model_receives: "structured_evidence_packet_only",
      raw_video_to_report_model: false,
      training_model_with_real_team_video: false
    },
    contains_real_school_team_video: Boolean(boundary.contains_real_school_team_video),
    default_allowed_uses: boundary.default_allowed_uses || ["local_analysis", "local_acceptance_test"],
    default_forbidden_uses: boundary.default_forbidden_uses || [
      "public_showcase",
      "external_distribution",
      "cloud_storage",
      "model_training"
    ],
    requires_explicit_authorization_for: [
      "real_school_team_video_storage",
      "cloud_upload",
      "external_sharing",
      "internal_rule_iteration",
      "model_training"
    ]
  };
}

async function buildPrivacyExport(userId) {
  const [privacyBoundary, uploadInventory] = await Promise.all([
    getPrivacyBoundary(),
    listUploadFiles(uploadDir)
  ]);
  const sessionRedaction = { removed_fields: [] };
  const sessions = readSessions(200)
    .filter((session) => session.user_id === userId)
    .map((session) => sanitizePrivacyExportValue(session, sessionRedaction, "sessions"));
  const memorySummaryRedaction = { removed_fields: [] };
  const memorySummary = sanitizePrivacyExportValue(buildMemorySummary(userId), memorySummaryRedaction, "memory_summary");
  return {
    schema_version: "privacy_export.v1",
    generated_at: new Date().toISOString(),
    user_id: userId,
    scope: "local_json_export_no_raw_video_bytes",
    storage: {
      sqlite_memory: "included",
      upload_inventory: "metadata_only",
      raw_video_bytes: "excluded",
      cloud_sync: "not_implemented"
    },
    privacy_boundary: privacyBoundary,
    export_redaction: {
      raw_video_bytes: "excluded",
      local_file_paths: "redacted",
      forbidden_fields: privacyExportForbiddenFields(),
      removed_field_count: sessionRedaction.removed_fields.length + memorySummaryRedaction.removed_fields.length,
      removed_fields: [...sessionRedaction.removed_fields, ...memorySummaryRedaction.removed_fields].slice(0, 20)
    },
    memory_summary: memorySummary,
    upload_inventory: uploadInventory,
    sessions
  };
}

function sanitizePrivacyExportValue(value, redaction = { removed_fields: [] }, location = "root") {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizePrivacyExportValue(item, redaction, `${location}[${index}]`));
  }
  if (!value || typeof value !== "object") return value;
  const result = {};
  const forbidden = new Set(privacyExportForbiddenFields());
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (forbidden.has(normalized)) {
      redaction.removed_fields.push(`${location}.${key}`);
      continue;
    }
    result[key] = sanitizePrivacyExportValue(item, redaction, `${location}.${key}`);
  }
  return result;
}

function privacyExportForbiddenFields() {
  return [
    "raw_video",
    "base64_video",
    "video_path",
    "uploaded_video",
    "full_transcript",
    "absolute_path",
    "absolutepath",
    "local_path",
    "server_path",
    "file_path",
    "path",
    "data_url"
  ];
}

function summarizeKnowledgeBase(kb) {
  const summary = {
    version: kb.version,
    source_count: Number(kb.source_count || 0),
    cards: Array.isArray(kb.cards) ? kb.cards.length : 0,
    signals: Array.isArray(kb.signal_registry?.signals) ? kb.signal_registry.signals.length : 0,
    diagnosis_rule_count: Number(kb.taxonomy?.diagnosis_rule_count || 0),
    repair_action_count: Number(kb.taxonomy?.repair_action_count || 0),
    errors: []
  };
  const expected = {
    source_count: 203,
    cards: 203,
    signals: 9,
    diagnosis_rule_count: 551,
    repair_action_count: 207
  };
  for (const [key, value] of Object.entries(expected)) {
    if (summary[key] !== value) {
      summary.errors.push(`knowledge_base.${key} expected ${value}, got ${summary[key]}`);
    }
  }
  return summary;
}

async function loadSampleManifest() {
  return JSON.parse(await readFile(sampleManifestPath, "utf8"));
}

async function getAuthorizedSampleReadiness() {
  return auditAuthorizedSampleReadiness(await loadSampleManifest());
}

async function listAuthorizedSamples() {
  const manifest = await loadSampleManifest();
  const samples = [];
  for (const sample of Array.isArray(manifest.samples) ? manifest.samples : []) {
    const resolved = await resolveAuthorizedSample(sample.id, "local_analysis").catch(() => null);
    if (!resolved) continue;
    samples.push({
      ...publicSample(resolved),
      video_url: `/api/sample-videos/${encodeURIComponent(resolved.id)}`
    });
  }
  return {
    schema_version: "sample_list.v1",
    privacy_boundary: manifest.privacy_boundary || null,
    samples
  };
}

async function resolveAuthorizedSample(sampleId, requiredScope) {
  const manifest = await loadSampleManifest();
  const sample = (manifest.samples || []).find((item) => item.id === sampleId);
  if (!sample) throw new Error(`sample not found: ${sampleId || "missing"}`);
  const scope = sample.authorization?.scope || [];
  if (sample.authorization?.status !== "authorized") {
    throw new Error(`sample is not authorized: ${sampleId}`);
  }
  if (requiredScope && !scope.includes(requiredScope)) {
    throw new Error(`sample lacks required scope ${requiredScope}: ${sampleId}`);
  }
  const absolutePath = path.resolve(root, sample.file_path || "");
  if (!absolutePath.startsWith(`${root}${path.sep}`) || !existsSync(absolutePath)) {
    throw new Error(`sample file is unavailable: ${sampleId}`);
  }
  return {
    ...sample,
    absolutePath,
    file_name: path.basename(sample.file_path || `${sample.id}.mp4`)
  };
}

function publicSample(sample) {
  return {
    id: sample.id,
    title: sample.title,
    file_name: sample.file_name || path.basename(sample.file_path || ""),
    source_type: sample.source_type,
    shot_type: sample.shot_type,
    camera_view: sample.camera_view,
    fps: sample.fps || null,
    duration_ms: sample.duration_ms || null,
    dimensions: sample.dimensions || null,
    authorization: {
      status: sample.authorization?.status || "missing",
      scope: sample.authorization?.scope || [],
      retention: sample.authorization?.retention || null,
      notes: sample.authorization?.notes || null
    },
    expected_use: sample.expected_use || null
  };
}

function enrichBodyFromSample(body, sample) {
  return {
    ...body,
    sample_id: sample.id,
    file_name: body.file_name || sample.file_name,
    camera_view: body.camera_view || sample.camera_view,
    shot_type: body.shot_type || sample.shot_type,
    fps: body.fps || sample.fps || null,
    sample_source_type: sample.source_type
  };
}

async function serveSampleVideo(sampleId, request, response) {
  let sample;
  try {
    sample = await resolveAuthorizedSample(sampleId, "local_analysis");
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
    return;
  }
  const info = await stat(sample.absolutePath);
  const range = request.headers.range;
  const contentType = contentTypeForVideo(sample.file_name);
  if (range) {
    const parsed = parseByteRange(range, info.size);
    if (!parsed) {
      sendInvalidByteRange(response, info.size);
      return;
    }
    const { start, end } = parsed;
    response.writeHead(206, {
      "content-type": contentType,
      "accept-ranges": "bytes",
      "content-range": `bytes ${start}-${end}/${info.size}`,
      "content-length": String(end - start + 1),
      "cache-control": "no-store"
    });
    createReadStream(sample.absolutePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "content-length": String(info.size),
    "cache-control": "no-store"
  });
  createReadStream(sample.absolutePath).pipe(response);
}

async function serveStoredUpload(upload, request, response) {
  if (!upload?.path || !existsSync(upload.path)) {
    return sendJson(response, { ok: false, error: "review_video_unavailable", message: "Local review video file is unavailable." }, 404);
  }
  const info = await stat(upload.path);
  const range = request.headers.range;
  const contentType = upload.content_type || contentTypeForVideo(upload.file_name);
  if (range) {
    const parsed = parseByteRange(range, info.size);
    if (!parsed) {
      sendInvalidByteRange(response, info.size);
      return;
    }
    const { start, end } = parsed;
    response.writeHead(206, {
      "content-type": contentType,
      "accept-ranges": "bytes",
      "content-range": `bytes ${start}-${end}/${info.size}`,
      "content-length": String(end - start + 1),
      "cache-control": "no-store"
    });
    createReadStream(upload.path, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "content-length": String(info.size),
    "cache-control": "no-store"
  });
  createReadStream(upload.path).pipe(response);
}

function contentTypeForVideo(fileName) {
  const ext = path.extname(fileName || "").toLowerCase();
  if (ext === ".mov" || ext === ".qt") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "video/mp4";
}

function sendInvalidByteRange(response, size) {
  response.writeHead(416, {
    "accept-ranges": "bytes",
    "content-range": `bytes */${size}`,
    "cache-control": "no-store"
  });
  response.end();
}

function parseByteRange(range, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range || "");
  if (!match || !(size > 0)) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }
  const start = Number(startText);
  const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

async function getKnowledgeSummary() {
  const kb = await loadKnowledgeBase();
  const scoringRegistry = await loadScoringRegistry();
  const creatorAngleMapping = await loadCreatorAngleMapping();
  const bodyAngleProblemMapping = await loadBodyAngleProblemMapping();
  const signals = kb.signal_registry?.signals || [];
  return {
    version: kb.version,
    cards: kb.source_count,
    diagnosis_rule_count: kb.taxonomy?.diagnosis_rule_count,
    repair_action_count: kb.taxonomy?.repair_action_count,
    signal_count: signals.length,
    featured_signals: signals.slice(0, 6).map((signal) => ({
      signal_id: signal.signal_id,
      name: signal.name,
      category: signal.category,
      confidence: signal.research_basis?.[0]?.confidence_level || "unknown"
    })),
    scoring_architecture: summarizeScoringRegistry(scoringRegistry),
    creator_angle_mapping: summarizeCreatorAngleMapping(creatorAngleMapping),
    body_angle_problem_mapping: summarizeBodyAngleProblemMapping(bodyAngleProblemMapping)
  };
}

async function createCoachReport(evidencePacket) {
  const reportEvidencePacket = normalizeEvidencePacketForReport(evidencePacket);
  const requestErrors = validateEvidencePacket(reportEvidencePacket);
  if (requestErrors.length) {
    const report = localCoachReport(reportEvidencePacket);
    return withReportContracts({ mode: "request_validation_fallback", report, validation_errors: requestErrors }, reportEvidencePacket);
  }
  if (!hasDiagnosableEvidence(reportEvidencePacket)) {
    const report = localCoachReport(reportEvidencePacket);
    return withReportContracts({
      mode: "evidence_insufficient_fallback",
      report,
      validation_errors: validateCoachReport(report, reportEvidencePacket)
    }, reportEvidencePacket);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const report = localCoachReport(reportEvidencePacket);
    return withReportContracts({ mode: "local_mock", report, validation_errors: validateCoachReport(report, reportEvidencePacket) }, reportEvidencePacket);
  }

  const payload = {
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [
      { role: "system", content: coachReportSystemPrompt },
      { role: "user", content: buildCoachUserPrompt(reportEvidencePacket) }
    ],
    response_format: { type: "json_object" },
    stream: false,
    max_tokens: 1800
  };
  const result = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!result.ok) {
    const message = await result.text();
    const report = localCoachReport(reportEvidencePacket);
    return withReportContracts({
      mode: "deepseek_error_fallback",
      error: message.slice(0, 600),
      report,
      validation_errors: validateCoachReport(report, reportEvidencePacket)
    }, reportEvidencePacket);
  }
  const data = await result.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  let report;
  try {
    report = parseJsonObjectContent(content);
  } catch (error) {
    report = localCoachReport(reportEvidencePacket);
    return withReportContracts({
      mode: "deepseek_parse_fallback",
      error: error.message,
      report,
      validation_errors: validateCoachReport(report, reportEvidencePacket)
    }, reportEvidencePacket);
  }
  report = sanitizeCoachReport(report);
  const validationErrors = validateCoachReport(report, reportEvidencePacket);
  if (validationErrors.length) {
    const fallback = localCoachReport(reportEvidencePacket);
    return withReportContracts({
      mode: "deepseek_validation_fallback",
      report: fallback,
      usage: data.usage || null,
      validation_errors: validationErrors,
      fallback_validation_errors: validateCoachReport(fallback, reportEvidencePacket)
    }, reportEvidencePacket);
  }
  return withReportContracts({ mode: "deepseek", report, usage: data.usage || null, validation_errors: [] }, reportEvidencePacket);
}

function withReportContracts(response, evidencePacket) {
  return {
    ...response,
    ...buildReportContracts(evidencePacket, response.report, {
      mode: response.mode,
      validation_errors: response.validation_errors || []
    })
  };
}

function hasDiagnosableEvidence(evidencePacket) {
  const hasCandidateSignal = (evidencePacket.matched_signals || []).some((signal) => signal.status === "candidate");
  const hasAllowedRule = (evidencePacket.matched_rules || []).some((rule) => rule.diagnosis_allowed !== false);
  return hasCandidateSignal && hasAllowedRule;
}

function parseJsonObjectContent(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch (firstError) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw firstError;
  }
}

function sanitizeCoachReport(report) {
  const clone = structuredClone(report);
  for (const item of clone.primary_diagnosis?.evidence || []) {
    if (typeof item.source === "string") {
      item.source = item.source.replace(/^(signal_id|rule_id|source):\s*/i, "").trim();
    }
    if (typeof item.rule_id === "string") {
      item.rule_id = item.rule_id.replace(/^rule_id:\s*/i, "").trim();
    }
    if (typeof item.metric_id === "string") {
      item.metric_id = item.metric_id.replace(/^metric_id:\s*/i, "").trim();
    }
  }
  return clone;
}

function validateEvidencePacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object") return ["evidence packet must be an object"];
  const privateFieldLocations = collectPrivateEvidenceFieldLocations(packet);
  if (privateFieldLocations.length) {
    errors.push(`evidence packet must not include raw video, base64 video, server video paths, upload records, full transcript, local paths, or data URLs: ${privateFieldLocations.slice(0, 8).join(", ")}`);
  }
  if (!Array.isArray(packet.matched_signals)) errors.push("matched_signals must be an array");
  if (!Array.isArray(packet.matched_rules)) errors.push("matched_rules must be an array");
  if (!packet.metrics || typeof packet.metrics !== "object") errors.push("metrics must be an object");
  if (!packet.confidence?.max_report_confidence) errors.push("confidence.max_report_confidence is required");
  for (const signal of packet.matched_signals || []) {
    if (!signal.signal_id || typeof signal.frame !== "number") {
      errors.push("each matched signal must include signal_id and frame");
    }
    if (signal.confidence < 0.5 && signal.status === "confirmed") {
      errors.push(`${signal.signal_id} confidence is too low for confirmed status`);
    }
  }
  return errors;
}

function collectPrivateEvidenceFieldLocations(value, location = "evidence_packet", matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPrivateEvidenceFieldLocations(item, `${location}[${index}]`, matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  const forbidden = new Set(privacyExportForbiddenFields());
  for (const [key, item] of Object.entries(value)) {
    const itemLocation = `${location}.${key}`;
    if (forbidden.has(key.toLowerCase())) {
      matches.push(itemLocation);
      continue;
    }
    collectPrivateEvidenceFieldLocations(item, itemLocation, matches);
  }
  return matches;
}
