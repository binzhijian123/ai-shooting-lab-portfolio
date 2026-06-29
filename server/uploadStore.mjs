import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const uploads = new Map();

export async function saveMultipartUpload(request, uploadDir) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) throw new Error("multipart boundary is required");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const parts = splitMultipart(body, boundary);
  const filePart = parts.find((part) => part.name === "video" && part.filename);
  if (!filePart) throw new Error("multipart field video is required");

  await mkdir(uploadDir, { recursive: true });
  const ext = safeExt(filePart.filename);
  const uploadId = `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const fileName = `${uploadId}${ext}`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, filePart.content);
  const record = {
    upload_id: uploadId,
    file_name: filePart.filename,
    path: filePath,
    bytes: filePart.content.length,
    content_type: filePart.contentType || "application/octet-stream",
    saved_at: new Date().toISOString()
  };
  uploads.set(uploadId, record);
  return publicUpload(record);
}

export function resolveUpload(uploadId) {
  return uploadId ? uploads.get(uploadId) || null : null;
}

export function updateUploadMetadata(uploadId, metadata) {
  const record = resolveUpload(uploadId);
  if (!record) return null;
  record.metadata = metadata;
  uploads.set(uploadId, record);
  return publicUpload(record);
}

export async function deleteUpload(uploadId, uploadDir) {
  const record = resolveUpload(uploadId);
  if (!record) {
    return { ok: false, upload_id: uploadId || null, deleted: false, error: "upload_not_found" };
  }
  const root = path.resolve(uploadDir);
  const filePath = path.resolve(record.path);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return { ok: false, upload_id: uploadId, deleted: false, error: "upload_path_outside_upload_dir" };
  }
  await rm(filePath, { force: true });
  uploads.delete(uploadId);
  return {
    ok: true,
    upload_id: uploadId,
    deleted: true,
    file_name: record.file_name,
    bytes: record.bytes
  };
}

export async function listUploadFiles(uploadDir) {
  await mkdir(uploadDir, { recursive: true });
  const entries = await readdir(uploadDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isManagedUploadFile(entry.name)) continue;
    const filePath = safeUploadPath(uploadDir, entry.name);
    const info = await stat(filePath);
    files.push({
      file_name: entry.name,
      bytes: info.size,
      modified_at: info.mtime.toISOString(),
      upload_id: entry.name.replace(/\.(mp4|mov|m4v|webm)$/i, "")
    });
  }
  files.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
  return {
    schema_version: "upload_file_inventory.v1",
    count: files.length,
    files
  };
}

export async function deleteUploadFile(fileName, uploadDir) {
  if (!isManagedUploadFile(fileName)) {
    return { ok: false, deleted: false, file_name: fileName || null, error: "invalid_upload_file_name" };
  }
  const filePath = safeUploadPath(uploadDir, fileName);
  try {
    await stat(filePath);
  } catch {
    return { ok: false, deleted: false, file_name: fileName, error: "upload_file_not_found" };
  }
  await rm(filePath, { force: true });
  const uploadId = fileName.replace(/\.(mp4|mov|m4v|webm)$/i, "");
  uploads.delete(uploadId);
  return {
    ok: true,
    deleted: true,
    file_name: fileName,
    upload_id: uploadId
  };
}

export async function cleanupUploadFiles(uploadDir, options = {}) {
  const olderThanDays = Math.max(0, Number(options.older_than_days ?? 7));
  const dryRun = options.dry_run !== false;
  const inventory = await listUploadFiles(uploadDir);
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const candidates = inventory.files.filter((file) => {
    const modifiedAt = new Date(file.modified_at).getTime();
    return Number.isFinite(modifiedAt) && modifiedAt < cutoff;
  });
  const deleted = [];
  if (!dryRun) {
    for (const file of candidates) {
      deleted.push(await deleteUploadFile(file.file_name, uploadDir));
    }
  }
  return {
    schema_version: "upload_cleanup.v1",
    dry_run: dryRun,
    older_than_days: olderThanDays,
    cutoff_at: new Date(cutoff).toISOString(),
    candidate_count: candidates.length,
    candidates,
    deleted_count: deleted.filter((item) => item.ok).length,
    deleted
  };
}

function splitMultipart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const raw = body.subarray(start + delimiter.length + 2, next - 2);
    const headerEnd = raw.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > 0) {
      const headers = raw.subarray(0, headerEnd).toString("utf8");
      const content = raw.subarray(headerEnd + 4);
      const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1];
      const filename = disposition.match(/filename="([^"]+)"/)?.[1];
      const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1];
      parts.push({ name, filename, contentType, content });
    }
    start = next;
  }
  return parts;
}

function publicUpload(record) {
  return {
    upload_id: record.upload_id,
    file_name: record.file_name,
    bytes: record.bytes,
    content_type: record.content_type,
    saved_at: record.saved_at,
    metadata: record.metadata || null
  };
}

function safeExt(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  return [".mp4", ".mov", ".m4v", ".webm"].includes(ext) ? ext : ".mp4";
}

function safeUploadPath(uploadDir, fileName) {
  const root = path.resolve(uploadDir);
  const filePath = path.resolve(root, fileName);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("upload path must stay inside upload directory");
  }
  return filePath;
}

function isManagedUploadFile(fileName) {
  return /^upload_\d+_[a-f0-9]+\.(mp4|mov|m4v|webm)$/i.test(fileName || "");
}
