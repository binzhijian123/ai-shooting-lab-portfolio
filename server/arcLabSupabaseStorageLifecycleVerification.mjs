export const ARC_LAB_SUPABASE_STORAGE_LIFECYCLE_VERIFICATION_SCHEMA_VERSION = "arc_lab_supabase_storage_lifecycle_verification.v1";

const CONFIRMATION_VALUE = "I_UNDERSTAND_THIS_WRITES_AND_DELETES_A_TEST_OBJECT";
const REQUIRED_ENV = [
  "ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_LAB_STORAGE_BUCKET",
  "ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY"
];
const REQUIRED_KEY_SEGMENT = "codex-storage-lifecycle";
const BODY = "arc-lab-storage-lifecycle-smoke";

export async function auditArcLabSupabaseStorageLifecycleVerification({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const requested = env?.ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY === CONFIRMATION_VALUE;
  const presentVariables = REQUIRED_ENV.filter((name) => hasEnv(env, name));
  const missingVariables = REQUIRED_ENV.filter((name) => !hasEnv(env, name));
  const base = {
    ok: true,
    schema_version: ARC_LAB_SUPABASE_STORAGE_LIFECYCLE_VERIFICATION_SCHEMA_VERSION,
    source_contract: "strong_opt_in_storage_object_lifecycle_write_read_delete_probe",
    live_verification_requested: requested,
    live_external_services_contacted: false,
    live_storage_object_uploaded: false,
    live_storage_object_read_verified: false,
    live_storage_object_deleted: false,
    live_storage_delete_verified: false,
    live_storage_lifecycle_verified: false,
    environment: {
      required_variables: REQUIRED_ENV,
      present_variables: presentVariables,
      missing_variables: missingVariables,
      confirmation_value_required: CONFIRMATION_VALUE,
      secret_values_exposed: false
    },
    checked: {
      object_key_exposed: false,
      required_object_key_segment: REQUIRED_KEY_SEGMENT,
      test_payload_bytes: BODY.length,
      probe_mode: "service_role_storage_upload_range_read_delete_read_after_delete"
    },
    boundaries: {
      strong_write_confirmation_required: true,
      no_migration_apply: true,
      no_database_mutation: true,
      controlled_storage_write_read_delete: true,
      test_object_key_must_include_lifecycle_segment: true,
      no_full_object_download: true,
      no_sms_provider_contact: true,
      no_secret_or_object_key_exposure: true,
      service_role_only: true
    }
  };

  if (!requested) {
    return {
      ...base,
      verification_status: "skipped_not_requested",
      next_manual_steps: [
        `Set ARC_LAB_LIVE_STORAGE_LIFECYCLE_VERIFY=${CONFIRMATION_VALUE} only for a staging bucket.`,
        "Use ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY under organization_uuid/athlete_uuid/codex-storage-lifecycle/...",
        "Do not point this probe at a real athlete video object."
      ]
    };
  }

  if (missingVariables.length > 0) {
    return {
      ...base,
      verification_status: "blocked_missing_environment",
      next_manual_steps: [
        "Provide the live Supabase URL, service role key, bucket, and dedicated lifecycle object key outside the repository.",
        "Use a disposable staging object key that contains codex-storage-lifecycle."
      ]
    };
  }

  if (typeof fetchImpl !== "function") {
    return { ...base, verification_status: "blocked_missing_fetch_runtime", errors: ["fetch runtime is not available"] };
  }

  const normalizedUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const objectKey = parseLifecycleObjectKey(env.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY);
  if (!normalizedUrl.ok || !objectKey.ok) {
    return {
      ...base,
      verification_status: "blocked_invalid_environment",
      errors: [
        ...(normalizedUrl.ok ? [] : [normalizedUrl.error]),
        ...(objectKey.ok ? [] : [objectKey.error])
      ]
    };
  }

  const headers = supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const upload = await storageStatus(fetchImpl, {
    baseUrl: normalizedUrl.value,
    bucket: env.ARC_LAB_STORAGE_BUCKET,
    objectKey: env.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY,
    method: "POST",
    headers: {
      ...headers,
      "content-type": "text/plain; charset=utf-8",
      "x-upsert": "false"
    },
    body: BODY
  });
  let read = null;
  let remove = null;
  let readAfterDelete = null;
  if (upload.ok) {
    read = await storageStatus(fetchImpl, {
      baseUrl: normalizedUrl.value,
      bucket: env.ARC_LAB_STORAGE_BUCKET,
      objectKey: env.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY,
      method: "GET",
      headers: { ...headers, Range: "bytes=0-0" },
      authenticated: true
    });
  }
  if (upload.ok) {
    remove = await storageStatus(fetchImpl, {
      baseUrl: normalizedUrl.value,
      bucket: env.ARC_LAB_STORAGE_BUCKET,
      objectKey: env.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY,
      method: "DELETE",
      headers
    });
    readAfterDelete = await storageStatus(fetchImpl, {
      baseUrl: normalizedUrl.value,
      bucket: env.ARC_LAB_STORAGE_BUCKET,
      objectKey: env.ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY,
      method: "GET",
      headers: { ...headers, Range: "bytes=0-0" },
      authenticated: true
    });
  }

  const uploaded = upload.ok;
  const readVerified = read?.ok === true;
  const deleted = remove?.ok === true;
  const deleteVerified = readAfterDelete?.status === 404 || readAfterDelete?.status === 400;
  const lifecycleVerified = uploaded && readVerified && deleted && deleteVerified;

  return {
    ...base,
    verification_status: lifecycleVerified
      ? "live_storage_lifecycle_verified"
      : deleted
        ? "live_storage_lifecycle_incomplete_cleaned_up"
        : uploaded
          ? "live_storage_lifecycle_incomplete_cleanup_failed"
          : "live_storage_lifecycle_upload_failed",
    live_external_services_contacted: true,
    live_storage_object_uploaded: uploaded,
    live_storage_object_read_verified: readVerified,
    live_storage_object_deleted: deleted,
    live_storage_delete_verified: deleteVerified,
    live_storage_lifecycle_verified: lifecycleVerified,
    probes: {
      upload: publicStatus(upload),
      read: read ? publicStatus(read) : null,
      delete: remove ? publicStatus(remove) : null,
      read_after_delete: readAfterDelete ? publicStatus(readAfterDelete) : null
    },
    next_manual_steps: lifecycleVerified
      ? ["Run the database-linked staging lifecycle next: insert video_assets, read through role policies, soft-delete, then delete the object."]
      : ["Inspect the failed Storage lifecycle step and manually remove the dedicated test object if cleanup failed."]
  };
}

export function validateArcLabSupabaseStorageLifecycleVerificationGate(input = {}) {
  const errors = [];
  if (input.schema_version !== ARC_LAB_SUPABASE_STORAGE_LIFECYCLE_VERIFICATION_SCHEMA_VERSION) {
    errors.push("schema version mismatch");
  }
  if (input.environment?.secret_values_exposed !== false) errors.push("Storage lifecycle gate must not expose secret values");
  if (input.live_verification_requested !== true && input.live_external_services_contacted !== false) {
    errors.push("Storage lifecycle gate must not contact external services without strong opt-in");
  }
  if (input.live_storage_lifecycle_verified === true) {
    for (const field of [
      "live_storage_object_uploaded",
      "live_storage_object_read_verified",
      "live_storage_object_deleted",
      "live_storage_delete_verified"
    ]) {
      if (input[field] !== true) errors.push(`Storage lifecycle verification requires ${field}`);
    }
  }
  if (input.boundaries?.controlled_storage_write_read_delete !== true) {
    errors.push("Storage lifecycle gate must declare controlled object mutation");
  }
  if (input.boundaries?.no_database_mutation !== true) errors.push("Storage lifecycle gate must not mutate database rows");
  if (input.checked?.object_key_exposed !== false) errors.push("Storage lifecycle gate must not expose object keys");
  return {
    ok: errors.length === 0,
    schema_version: "arc_lab_supabase_storage_lifecycle_verification_validation.v1",
    errors,
    checked: input.checked,
    boundaries: input.boundaries
  };
}

function parseLifecycleObjectKey(value) {
  const text = String(value || "").trim();
  const segments = text.split("/");
  const safe = !text.startsWith("/")
    && !text.includes("\\")
    && segments.length >= 4
    && segments.every((segment) => segment && segment !== "." && segment !== "..")
    && isUuid(segments[0])
    && isUuid(segments[1])
    && segments.includes(REQUIRED_KEY_SEGMENT);
  return {
    ok: safe,
    error: safe ? null : `ARC_LAB_STORAGE_LIFECYCLE_OBJECT_KEY must be organization_uuid/athlete_uuid/.../${REQUIRED_KEY_SEGMENT}/...`
  };
}

async function storageStatus(fetchImpl, { baseUrl, bucket, objectKey, method, headers, body, authenticated = false }) {
  const encodedPath = objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const mode = authenticated ? "object/authenticated" : "object";
  const url = new URL(`/storage/v1/${mode}/${encodeURIComponent(bucket)}/${encodedPath}`, baseUrl);
  try {
    const response = await fetchImpl(url, { method, headers, body });
    const status = Number(response?.status) || null;
    if (typeof response?.body?.cancel === "function") await response.body.cancel();
    return { operation: method.toLowerCase(), status, ok: status !== null && status >= 200 && status < 300 };
  } catch (error) {
    return {
      operation: method.toLowerCase(),
      status: null,
      ok: false,
      error: firstLine(error?.message || "network_error")
    };
  }
}

function publicStatus(result) {
  return {
    operation: result.operation,
    status: result.status,
    ok: result.ok,
    ...(result.error ? { error: result.error } : {})
  };
}

function supabaseHeaders(token) {
  return { apikey: token, authorization: `Bearer ${token}` };
}

function normalizeSupabaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL must use https" };
    return { ok: true, value: url.origin };
  } catch {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL" };
  }
}

function hasEnv(env, name) {
  return String(env?.[name] || "").trim().length > 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function firstLine(value) {
  return String(value).split("\n")[0].slice(0, 160);
}
