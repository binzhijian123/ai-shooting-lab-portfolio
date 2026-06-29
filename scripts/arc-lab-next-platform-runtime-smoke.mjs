import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appRoot = path.join(root, "apps", "coach-platform");
const pnpmBin = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm";
const nodeBinDir = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin";
const binDir = "/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin";
const smokeEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  PATH: `${nodeBinDir}:${binDir}:${process.env.PATH || ""}`
};

await access(path.join(appRoot, "pnpm-lock.yaml"));
await access(path.join(appRoot, "pnpm-workspace.yaml"));

const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
assert.equal(packageJson.scripts?.build, "next build");
assert.equal(packageJson.scripts?.["smoke:runtime"], "node ../../scripts/arc-lab-next-platform-runtime-smoke.mjs");
assert(packageJson.pnpm?.onlyBuiltDependencies?.includes("sharp"), "sharp build approval missing");

const install = await run("pnpm install --frozen-lockfile", [pnpmBin, "install", "--frozen-lockfile", "--fetch-timeout", "600000", "--fetch-retries", "3"]);
assert.equal(install.code, 0, install.output);
const build = await run("pnpm build", [pnpmBin, "build"]);
assert.equal(build.code, 0, build.output);

assert(build.output.includes("Compiled successfully"), "Next build did not report successful compilation");
assert(build.output.includes("Route (app)"), "Next build route summary missing");
assert(build.output.includes("○ /"), "Next build did not prerender root route");
await access(path.join(appRoot, ".next", "standalone"));
await access(path.join(appRoot, ".next", "static"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_next_platform_runtime_smoke.v1",
  source_contract: "local_nextjs_build_verified_not_live_supabase_or_sms_storage",
  checked: {
    pnpm_frozen_lockfile_install: true,
    next_build: true,
    standalone_output_exists: true,
    static_assets_exist: true,
    telemetry_disabled: true
  },
  boundaries: {
    live_supabase_project_verified: false,
    live_sms_auth_verified: false,
    live_storage_verified: false,
    next_dev_server_started: false,
    production_deployment_verified: false
  }
}, null, 2));

async function run(label, command) {
  const child = spawn(command[0], command.slice(1), {
    cwd: appRoot,
    env: smokeEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  return {
    label,
    code,
    output
  };
}
