import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARC_LAB_NEXT_PLATFORM_FILES,
  summarizeArcLabNextPlatformScaffold,
  validateArcLabNextPlatformScaffold
} from "../server/arcLabNextPlatformScaffold.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const validation = await validateArcLabNextPlatformScaffold(root);
if (!validation.ok) {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_next_platform_smoke.v1",
  source_contract: validation.summary.source_contract,
  scaffold: summarizeArcLabNextPlatformScaffold(),
  checked_files: Object.values(ARC_LAB_NEXT_PLATFORM_FILES),
  boundaries: {
    next_runtime_static_contract_only: true,
    next_build_verified_by: "scripts/arc-lab-next-platform-runtime-smoke.mjs",
    live_supabase_project_verified: false,
    live_sms_auth_verified: false,
    live_storage_verified: false,
    local_shell_fallback: "/arc-lab.html"
  }
}, null, 2));
