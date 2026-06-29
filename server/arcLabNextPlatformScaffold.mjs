import { readFile } from "node:fs/promises";
import path from "node:path";

export const ARC_LAB_NEXT_PLATFORM_SCAFFOLD_SCHEMA_VERSION = "arc_lab_next_platform_scaffold.v1";

export const ARC_LAB_NEXT_PLATFORM_FILES = {
  packageJson: "package.json",
  nextConfig: "next.config.mjs",
  tsconfig: "tsconfig.json",
  layout: "app/layout.tsx",
  page: "app/page.tsx",
  css: "app/globals.css",
  boundary: "lib/supabase-boundary.ts",
  pnpmLock: "pnpm-lock.yaml",
  pnpmWorkspace: "pnpm-workspace.yaml",
  readme: "README.md"
};

export async function validateArcLabNextPlatformScaffold(root) {
  const appRoot = path.join(root, "apps", "coach-platform");
  const errors = [];
  const sources = {};

  for (const [key, relativePath] of Object.entries(ARC_LAB_NEXT_PLATFORM_FILES)) {
    try {
      sources[key] = await readFile(path.join(appRoot, relativePath), "utf8");
    } catch (error) {
      errors.push(`missing or unreadable ${relativePath}: ${error.message}`);
    }
  }

  if (errors.length) return buildResult(errors);

  const pkg = parsePackageJson(sources.packageJson, errors);
  requireEqual(errors, pkg?.scripts?.dev, "next dev", "coach-platform package must expose next dev");
  requireEqual(errors, pkg?.scripts?.build, "next build", "coach-platform package must expose next build");
  requireEqual(errors, pkg?.scripts?.["lint:contract"], "node ../../scripts/arc-lab-next-platform-smoke.mjs", "coach-platform package must expose static contract lint");
  requireEqual(errors, pkg?.scripts?.["smoke:runtime"], "node ../../scripts/arc-lab-next-platform-runtime-smoke.mjs", "coach-platform package must expose runtime smoke");
  requireEqual(errors, pkg?.scripts?.["smoke:browser"], "node ../../scripts/arc-lab-next-platform-browser-smoke.mjs", "coach-platform package must expose browser smoke");
  if (!Array.isArray(pkg?.pnpm?.onlyBuiltDependencies) || !pkg.pnpm.onlyBuiltDependencies.includes("sharp")) {
    errors.push("coach-platform package must explicitly allow sharp build scripts for Next image dependency");
  }
  for (const dependency of ["next", "react", "react-dom", "@supabase/supabase-js"]) {
    if (!pkg?.dependencies?.[dependency]) errors.push(`missing dependency ${dependency}`);
  }

  requireIncludes(errors, sources.nextConfig, "output: \"standalone\"", "Next standalone output missing");
  requireIncludes(errors, sources.tsconfig, "\"jsx\": \"preserve\"", "Next tsconfig JSX setting missing");
  requireIncludes(errors, sources.pnpmLock, "next:", "pnpm lockfile missing Next dependency");
  requireIncludes(errors, sources.pnpmLock, "@supabase/supabase-js", "pnpm lockfile missing Supabase dependency");
  requireIncludes(errors, sources.pnpmWorkspace, "sharp: true", "pnpm workspace must approve sharp build scripts");
  for (const envName of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ARC_LAB_STORAGE_BUCKET",
    "ARC_LAB_SMS_PROVIDER",
    "ARC_LAB_SMS_ACCOUNT_ID",
    "ARC_LAB_SMS_AUTH_TOKEN"
  ]) {
    requireIncludes(errors, sources.boundary, envName, `boundary helper missing env ${envName}`);
  }

  for (const boundaryNeedle of [
    "static_nextjs_app_router_scaffold_not_installed_or_deployed",
    "liveSupabaseProjectVerified: false",
    "liveSmsAuthVerified: false",
    "liveStorageVerified: false",
    "aiFinalDiagnosisAllowed: false",
    "studentFinalSourceOfTruth: \"coach_feedback\"",
    "runtimeStatus: \"local_next_build_verified_by_runtime_smoke\""
  ]) {
    requireIncludes(errors, sources.boundary, boundaryNeedle, `boundary helper missing ${boundaryNeedle}`);
  }

  for (const pageNeedle of [
    "readSupabaseBoundary(process.env)",
    "教练主导的投篮复盘工作台",
    "教练待办",
    "学生端结果",
    "Supabase 边界",
    "AI 草稿、编辑 diff、原始证据追踪默认隐藏",
    "href={ARC_LAB_PLATFORM_BOUNDARY.localShellFallback}"
  ]) {
    requireIncludes(errors, sources.page, pageNeedle, `page missing ${pageNeedle}`);
  }

  requireIncludes(errors, sources.layout, "Arc Lab Coach OS", "layout metadata missing product name");
  requireIncludes(errors, sources.css, "@media (max-width: 860px)", "responsive product layout missing");
  if (sources.css.includes("background-clip: text")) errors.push("gradient text pattern is forbidden in product UI");
  if (sources.css.includes("repeating-linear-gradient")) errors.push("decorative stripe background is forbidden in product UI");
  if (/border-radius:\s*(3[2-9]|[4-9]\d)px/.test(sources.css)) errors.push("over-rounded product UI radius detected");

  for (const readmeNeedle of [
    "local Next build smoke",
    "Dependencies are locked with pnpm",
    "not a live Supabase deployment"
  ]) {
    requireIncludes(errors, sources.readme, readmeNeedle, `README missing boundary text ${readmeNeedle}`);
  }

  return buildResult(errors);
}

export function summarizeArcLabNextPlatformScaffold() {
  return {
    schema_version: ARC_LAB_NEXT_PLATFORM_SCAFFOLD_SCHEMA_VERSION,
    source_contract: "nextjs_coach_platform_scaffold_with_separate_runtime_smoke",
    app_path: "apps/coach-platform",
    app_router_files: ["app/layout.tsx", "app/page.tsx", "app/globals.css"],
    declared_dependencies: ["next", "react", "react-dom", "@supabase/supabase-js"],
    lockfile: "apps/coach-platform/pnpm-lock.yaml",
    runtime_smoke: "scripts/arc-lab-next-platform-runtime-smoke.mjs",
    browser_smoke: "scripts/arc-lab-next-platform-browser-smoke.mjs",
    local_shell_fallback: "/arc-lab.html",
    live_supabase_project_verified: false,
    next_runtime_verified_by_static_check: false
  };
}

function buildResult(errors) {
  return {
    ok: errors.length === 0,
    schema_version: ARC_LAB_NEXT_PLATFORM_SCAFFOLD_SCHEMA_VERSION,
    summary: summarizeArcLabNextPlatformScaffold(),
    errors
  };
}

function parsePackageJson(source, errors) {
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`invalid package.json: ${error.message}`);
    return null;
  }
}

function requireIncludes(errors, source, needle, message) {
  if (!source.includes(needle)) errors.push(message);
}

function requireEqual(errors, actual, expected, message) {
  if (actual !== expected) errors.push(`${message}: expected ${expected}, got ${actual}`);
}
