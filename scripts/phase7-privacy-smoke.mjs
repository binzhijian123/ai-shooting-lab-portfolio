import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const uploadDir = path.join(root, "data", "uploads");

const manifest = JSON.parse(await readFile(path.join(root, "data", "sample_manifest.json"), "utf8"));
const sampleId = readArg("--sample-id") || "synthetic_ball";
const sample = manifest.samples?.find((item) => item.id === sampleId);
if (!sample) fail(`sample not found in data/sample_manifest.json: ${sampleId}`);
if (sample.authorization?.status !== "authorized") fail(`sample is not authorized: ${sampleId}`);
if (!sample.authorization?.scope?.includes("local_acceptance_test")) {
  fail(`sample is not authorized for local_acceptance_test: ${sampleId}`);
}

const port = Number(readArg("--port")) || await freePort();
const baseUrl = readArg("--base-url") || `http://localhost:${port}`;
const startedServer = !readArg("--base-url");
let serverProcess = null;
let uploadId = null;
let uploadedFilePath = null;
const controlledFileName = `upload_${Date.now()}_abcdef123456.mp4`;
const controlledFilePath = path.join(uploadDir, controlledFileName);
const missingFileName = `upload_${Date.now()}_000000000000.mp4`;
const cleanupFileName = `upload_${Date.now() + 1}_feedface1234.mp4`;
const cleanupFilePath = path.join(uploadDir, cleanupFileName);
const unmanagedFileName = `phase7_unmanaged_${Date.now()}.mp4`;
const unmanagedFilePath = path.join(uploadDir, unmanagedFileName);
const localUserDeleteId = `phase7_delete_${Date.now()}`;
const cleanupErrors = [];

try {
  if (startedServer) {
    serverProcess = await startServer(port);
  } else {
    await waitForServer(baseUrl);
  }

  const boundary = await fetchJson(`${baseUrl}/api/privacy-boundary`);
  assert(boundary.schema_version === "privacy_boundary.v1", "privacy boundary schema mismatch");
  assert(boundary.storage?.cloud_sync === "not_implemented", "cloud sync must be not_implemented");
  assert(boundary.model_use?.raw_video_to_report_model === false, "raw video must not be report model input");
  for (const forbidden of ["public_showcase", "external_distribution", "cloud_storage", "model_training"]) {
    assert((boundary.default_forbidden_uses || []).includes(forbidden), `forbidden use missing: ${forbidden}`);
  }

  const upload = await uploadSample(baseUrl, sample);
  uploadId = upload.upload_id;
  uploadedFilePath = path.join(uploadDir, `${upload.upload_id}.mp4`);
  assert(upload.upload_id, "upload_id missing");
  assert(await exists(uploadedFilePath), "uploaded file not found before delete");

  const exportBefore = await fetchJson(`${baseUrl}/api/privacy-export`);
  assert(exportBefore.schema_version === "privacy_export.v1", "privacy export schema mismatch");
  assert(exportBefore.scope === "local_json_export_no_raw_video_bytes", "privacy export scope mismatch");
  assert(exportBefore.storage?.raw_video_bytes === "excluded", "privacy export must exclude raw video bytes");
  assert(exportBefore.storage?.cloud_sync === "not_implemented", "privacy export cloud sync mismatch");
  assert(exportBefore.upload_inventory?.schema_version === "upload_file_inventory.v1", "privacy export upload inventory missing");

  await postJson(`${baseUrl}/api/sessions`, buildSessionPayload(`${localUserDeleteId}_a`, localUserDeleteId, "long_term"));
  await postJson(`${baseUrl}/api/sessions`, buildSessionPayload(`${localUserDeleteId}_b`, localUserDeleteId, "short_term_review"));
  const privateLocalPath = path.join(root, "data", "uploads", "private-real-sample.mov");
  await postJson(`${baseUrl}/api/sessions`, buildSessionPayload(
    `${localUserDeleteId}_redaction`,
    localUserDeleteId,
    "short_term_review",
    {
      evidence: {
        video_path: privateLocalPath,
        uploaded_video: { path: privateLocalPath, bytes: 123456 },
        video_context: {
          file_path: privateLocalPath,
          absolutePath: privateLocalPath,
          safe_file_name: "private-real-sample.mov"
        }
      },
      report: {
        data_url: "data:video/mp4;base64,not-real-but-forbidden",
        kept_note: "privacy export redaction smoke"
      }
    }
  ));
  const userExportBeforeDelete = await fetchJson(`${baseUrl}/api/privacy-export?user_id=${encodeURIComponent(localUserDeleteId)}`);
  assert(userExportBeforeDelete.sessions?.length === 3, "isolated user sessions missing before delete");
  assert(userExportBeforeDelete.export_redaction?.local_file_paths === "redacted", "privacy export redaction boundary missing");
  assert(Number(userExportBeforeDelete.export_redaction?.removed_field_count || 0) >= 6, "privacy export did not report removed private fields");
  const exportedSessionsJson = JSON.stringify(userExportBeforeDelete.sessions);
  const exportedSummaryJson = JSON.stringify(userExportBeforeDelete.memory_summary);
  for (const forbidden of ["video_path", "uploaded_video", "file_path", "absolutePath", "data_url", privateLocalPath]) {
    assert(!exportedSessionsJson.includes(forbidden), `privacy export sessions leaked forbidden field/value: ${forbidden}`);
    assert(!exportedSummaryJson.includes(forbidden), `privacy export memory summary leaked forbidden field/value: ${forbidden}`);
  }
  const userDelete = await fetchJson(`${baseUrl}/api/users/${encodeURIComponent(localUserDeleteId)}/sessions`, { method: "DELETE" });
  assert(userDelete.ok === true, "local user session delete failed");
  assert(userDelete.deleted === 3, `local user session delete count mismatch: ${userDelete.deleted}`);
  assert(userDelete.scope === "local_sqlite_sessions_only", "local user delete scope mismatch");
  assert(userDelete.raw_video_deleted === false, "local user delete must not delete raw video");
  assert(await exists(uploadedFilePath), "local user session delete removed upload video");
  const userExportAfterDelete = await fetchJson(`${baseUrl}/api/privacy-export?user_id=${encodeURIComponent(localUserDeleteId)}`);
  assert(userExportAfterDelete.sessions?.length === 0, "isolated user sessions remained after delete");

  const uploadDelete = await fetchJson(`${baseUrl}/api/uploads/${encodeURIComponent(upload.upload_id)}`, { method: "DELETE" });
  uploadId = null;
  assert(uploadDelete.ok === true && uploadDelete.deleted === true, "current upload delete failed");
  assert(!(await exists(uploadedFilePath)), "uploaded file still exists after delete");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(controlledFilePath, "phase7 controlled delete smoke\n");
  await writeFile(unmanagedFilePath, "phase7 unmanaged local file smoke\n");
  const inventoryBefore = await fetchJson(`${baseUrl}/api/upload-files`);
  assert(inventoryBefore.schema_version === "upload_file_inventory.v1", "upload inventory schema mismatch");
  assert((inventoryBefore.files || []).some((file) => file.file_name === controlledFileName), "controlled file missing from inventory");
  assert(!(inventoryBefore.files || []).some((file) => file.file_name === unmanagedFileName), "unmanaged local file must not appear in upload inventory");
  const unmanagedDeleteResponse = await fetch(`${baseUrl}/api/upload-files/${encodeURIComponent(unmanagedFileName)}`, { method: "DELETE" });
  const unmanagedDelete = await unmanagedDeleteResponse.json();
  assert(unmanagedDeleteResponse.status === 400, `unmanaged upload file delete status mismatch: ${unmanagedDeleteResponse.status}`);
  assert(unmanagedDelete.ok === false && unmanagedDelete.deleted === false, "unmanaged file delete must not claim deletion");
  assert(unmanagedDelete.error === "invalid_upload_file_name", `unmanaged upload file error mismatch: ${unmanagedDelete.error}`);
  assert(await exists(unmanagedFilePath), "unmanaged local file was deleted through upload-file endpoint");
  const controlledDelete = await fetchJson(`${baseUrl}/api/upload-files/${encodeURIComponent(controlledFileName)}`, { method: "DELETE" });
  assert(controlledDelete.ok === true && controlledDelete.deleted === true, "controlled file delete failed");
  assert(!(await exists(controlledFilePath)), "controlled file still exists after delete");
  const missingDeleteResponse = await fetch(`${baseUrl}/api/upload-files/${encodeURIComponent(missingFileName)}`, { method: "DELETE" });
  const missingDelete = await missingDeleteResponse.json();
  assert(missingDeleteResponse.status === 404, `missing upload file delete status mismatch: ${missingDeleteResponse.status}`);
  assert(missingDelete.ok === false && missingDelete.deleted === false, "missing upload file delete must not claim deletion");
  assert(missingDelete.error === "upload_file_not_found", `missing upload file error mismatch: ${missingDelete.error}`);

  await writeFile(cleanupFilePath, "phase7 cleanup smoke\n");
  const oldDate = new Date("2000-01-01T00:00:00.000Z");
  await utimes(cleanupFilePath, oldDate, oldDate);
  const dryRun = await postJson(`${baseUrl}/api/upload-files/cleanup`, { older_than_days: 3650, dry_run: true });
  assert(dryRun.schema_version === "upload_cleanup.v1", "cleanup dry-run schema mismatch");
  assert(dryRun.dry_run === true, "cleanup dry-run flag mismatch");
  assert((dryRun.candidates || []).some((file) => file.file_name === cleanupFileName), "cleanup file missing from dry-run candidates");
  assert(!(dryRun.candidates || []).some((file) => file.file_name === unmanagedFileName), "unmanaged local file must not appear in cleanup candidates");
  assert(await exists(cleanupFilePath), "dry-run deleted cleanup file");
  const run = await postJson(`${baseUrl}/api/upload-files/cleanup`, { older_than_days: 3650, dry_run: false });
  assert(run.dry_run === false, "cleanup run dry_run flag mismatch");
  assert((run.deleted || []).some((item) => item.file_name === cleanupFileName && item.ok), "cleanup file was not deleted");
  assert(!(await exists(cleanupFilePath)), "cleanup file still exists after run");
  assert(await exists(unmanagedFilePath), "cleanup run deleted unmanaged local file");

  const mainJs = await fetchText(`${baseUrl}/main.js`);
  assert(mainJs.includes("downloadPrivacyExport"), "frontend privacy export button binding missing");
  assert(mainJs.includes("/api/privacy-export"), "frontend privacy export API binding missing");
  assert(mainJs.includes("deleteLocalUserSessions"), "frontend local user delete binding missing");
  assert(mainJs.includes("cleanupUploadFiles"), "frontend cleanup binding missing");

  console.log(JSON.stringify({
    ok: true,
    schema_version: "phase7_privacy_smoke.v1",
    boundary: {
      schema_version: boundary.schema_version,
      raw_video: boundary.storage.raw_video,
      cloud_sync: boundary.storage.cloud_sync,
      raw_video_to_report_model: boundary.model_use.raw_video_to_report_model,
      forbidden: boundary.default_forbidden_uses
    },
    privacy_export: {
      schema_version: exportBefore.schema_version,
      scope: exportBefore.scope,
      raw_video_bytes: exportBefore.storage.raw_video_bytes,
      upload_inventory_schema: exportBefore.upload_inventory.schema_version,
      redaction: userExportBeforeDelete.export_redaction.local_file_paths,
      removed_field_count: userExportBeforeDelete.export_redaction.removed_field_count
    },
    upload_delete: {
      deleted: uploadDelete.deleted,
      exists_after_delete: await exists(uploadedFilePath)
    },
    local_user_delete: {
      user_id: localUserDeleteId,
      deleted: userDelete.deleted,
      scope: userDelete.scope,
      raw_video_deleted: userDelete.raw_video_deleted,
      sessions_after_delete: userExportAfterDelete.sessions?.length || 0
    },
    controlled_file_delete: {
      file_name: controlledFileName,
      deleted: controlledDelete.deleted,
      exists_after_delete: await exists(controlledFilePath)
    },
    missing_file_delete: {
      file_name: missingFileName,
      status: missingDeleteResponse.status,
      deleted: missingDelete.deleted,
      error: missingDelete.error
    },
    unmanaged_file_boundary: {
      file_name: unmanagedFileName,
      inventory_visible: (inventoryBefore.files || []).some((file) => file.file_name === unmanagedFileName),
      delete_status: unmanagedDeleteResponse.status,
      deleted: unmanagedDelete.deleted,
      exists_after_delete_attempt: await exists(unmanagedFilePath)
    },
    retention_cleanup: {
      dry_run: dryRun.dry_run,
      dry_found_temp: (dryRun.candidates || []).some((file) => file.file_name === cleanupFileName),
      dry_found_unmanaged: (dryRun.candidates || []).some((file) => file.file_name === unmanagedFileName),
      run_deleted_temp: (run.deleted || []).some((item) => item.file_name === cleanupFileName && item.ok),
      exists_after_run: await exists(cleanupFilePath),
      unmanaged_exists_after_run: await exists(unmanagedFilePath)
    },
    frontend_bindings: {
      privacy_export_button: mainJs.includes("downloadPrivacyExport"),
      privacy_export_api: mainJs.includes("/api/privacy-export"),
      local_user_delete: mainJs.includes("deleteLocalUserSessions"),
      cleanup: mainJs.includes("cleanupUploadFiles")
    }
  }, null, 2));
} finally {
  if (uploadId) {
    await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" })
      .then((response) => response.ok || response.status === 404 || cleanupErrors.push(`upload cleanup status ${response.status}: ${uploadId}`))
      .catch((error) => cleanupErrors.push(`upload cleanup failed ${uploadId}: ${error.message}`));
  }
  for (const filePath of [controlledFilePath, cleanupFilePath, unmanagedFilePath]) {
    await rm(filePath, { force: true })
      .catch((error) => cleanupErrors.push(`file cleanup failed ${filePath}: ${error.message}`));
  }
  await fetch(`${baseUrl}/api/users/${encodeURIComponent(localUserDeleteId)}/sessions`, { method: "DELETE" })
    .then((response) => response.ok || cleanupErrors.push(`local user cleanup status ${response.status}: ${localUserDeleteId}`))
    .catch((error) => cleanupErrors.push(`local user cleanup failed ${localUserDeleteId}: ${error.message}`));
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (cleanupErrors.length) {
    console.error(`cleanup warnings: ${cleanupErrors.join("; ")}`);
    process.exitCode = process.exitCode || 1;
  }
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

async function uploadSample(baseUrl, sample) {
  const filePath = path.join(root, sample.file_path);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("video", new Blob([bytes], { type: "video/mp4" }), path.basename(sample.file_path));
  const response = await fetch(`${baseUrl}/api/upload-video`, {
    method: "POST",
    body: form
  });
  if (!response.ok) fail(`upload failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`request failed: ${url} ${response.status} ${await response.text()}`);
  return response.text();
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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

function buildSessionPayload(sessionId, userId, memoryStatus, extra = {}) {
  const evidence = {
    session_id: sessionId,
    user_profile: {
      user_id: userId,
      goal: "Phase 7 local SQLite delete smoke"
    },
    session: {
      camera_view: "side",
      fps: 30
    },
    video_context: {
      file_name: `${sessionId}.mp4`,
      camera_view: "side",
      fps: 30
    },
    confidence: {
      overall: memoryStatus === "long_term" ? 0.82 : 0.42
    },
    metrics: {
      ball_lift_knee_delta_ms: memoryStatus === "long_term" ? 120 : 240,
      trunk_lean_release_deg: 3
    },
    matched_signals: [],
    missing_evidence: [],
    ...(extra.evidence || {})
  };
  evidence.video_context = {
    file_name: `${sessionId}.mp4`,
    camera_view: "side",
    fps: 30,
    ...(extra.evidence?.video_context || {})
  };
  return {
    session_id: sessionId,
    title: `Phase 7 local user delete ${memoryStatus}`,
    memory_status: memoryStatus,
    evidence,
    report: {
      summary: "Phase 7 local user delete smoke",
      ...(extra.report || {})
    },
    ...(extra.feedback ? { feedback: extra.feedback } : {})
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`phase7 privacy smoke failed: ${message}`);
}
