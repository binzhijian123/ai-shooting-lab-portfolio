export const ARC_LAB_REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
] as const;

export const ARC_LAB_REQUIRED_SERVER_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_LAB_STORAGE_BUCKET",
  "ARC_LAB_SMS_PROVIDER",
  "ARC_LAB_SMS_ACCOUNT_ID",
  "ARC_LAB_SMS_AUTH_TOKEN"
] as const;

export const ARC_LAB_PLATFORM_BOUNDARY = {
  schemaVersion: "arc_lab_next_platform_boundary.v1",
  sourceContract: "static_nextjs_app_router_scaffold_not_installed_or_deployed",
  localShellFallback: "/arc-lab.html",
  liveSupabaseProjectVerified: false,
  liveSmsAuthVerified: false,
  liveStorageVerified: false,
  aiFinalDiagnosisAllowed: false,
  studentFinalSourceOfTruth: "coach_feedback",
  runtimeStatus: "local_next_build_verified_by_runtime_smoke"
} as const;

export function readSupabaseBoundary(env: Record<string, string | undefined>) {
  const publicMissing = ARC_LAB_REQUIRED_PUBLIC_ENV.filter((name) => !env[name]);
  const serverMissing = ARC_LAB_REQUIRED_SERVER_ENV.filter((name) => !env[name]);

  return {
    ...ARC_LAB_PLATFORM_BOUNDARY,
    publicEnvConfigured: publicMissing.length === 0,
    serverEnvConfigured: serverMissing.length === 0,
    missingPublicEnv: publicMissing,
    missingServerEnv: serverMissing
  };
}
