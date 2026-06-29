import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nodeBin = process.execPath;

const syntaxFiles = [
  "app/main.js",
  "app/arc-lab.js",
  "server/index.mjs",
  "server/uploadStore.mjs",
  "server/memoryStore.mjs",
  "server/ballTrajectory.mjs",
  "server/visionPipeline.mjs",
  "server/angleKnowledgeRetrieval.mjs",
  "server/multiAngleEvidence.mjs",
  "server/reportContracts.mjs",
  "server/alphaTestPolicy.mjs",
  "server/sampleManifestPolicy.mjs",
  "server/sampleReadinessPolicy.mjs",
  "server/arcLabContracts.mjs",
  "server/arcLabWorkflow.mjs",
  "server/arcLabTrends.mjs",
  "server/arcLabKnowledgeAssistant.mjs",
  "server/arcLabPlatform.mjs",
  "server/arcLabNextPlatformScaffold.mjs",
  "server/arcLabSupabaseProduction.mjs",
  "server/arcLabDeploymentReadiness.mjs",
  "server/arcLabSupabaseLiveVerification.mjs",
  "server/arcLabSupabaseRlsLiveVerification.mjs",
  "server/arcLabSupabaseStorageLiveVerification.mjs",
  "server/arcLabSupabaseStorageLifecycleVerification.mjs",
  "server/arcLabIdentityStore.mjs",
  "packages/analysis-engine/index.mjs",
  "scripts/mobile-layout-smoke.mjs",
  "scripts/mobile-browser-smoke.mjs",
  "scripts/arc-lab-contract-smoke.mjs",
  "scripts/arc-lab-workflow-smoke.mjs",
  "scripts/arc-lab-trend-smoke.mjs",
    "scripts/arc-lab-knowledge-assistant-smoke.mjs",
    "scripts/arc-lab-knowledge-directory-smoke.mjs",
    "scripts/arc-lab-platform-smoke.mjs",
    "scripts/arc-lab-next-platform-smoke.mjs",
    "scripts/arc-lab-next-platform-runtime-smoke.mjs",
    "scripts/arc-lab-next-platform-browser-smoke.mjs",
    "scripts/arc-lab-coach-home-smoke.mjs",
    "scripts/arc-lab-review-smoke.mjs",
    "scripts/arc-lab-audited-deletion-smoke.mjs",
  "scripts/arc-lab-pwa-smoke.mjs",
  "scripts/arc-lab-deployment-readiness-smoke.mjs",
  "scripts/arc-lab-live-trend-smoke.mjs",
  "scripts/arc-lab-supabase-production-smoke.mjs",
  "scripts/arc-lab-supabase-sql-sanity-smoke.mjs",
  "scripts/arc-lab-supabase-live-verification-smoke.mjs",
  "scripts/arc-lab-supabase-rls-live-verification-smoke.mjs",
  "scripts/arc-lab-supabase-storage-live-verification-smoke.mjs",
  "scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs",
  "scripts/boundary-claims-smoke.mjs",
  "scripts/phase-completion-audit.mjs",
  "scripts/sample-manifest-smoke.mjs",
  "scripts/authorized-sample-readiness-smoke.mjs",
  "scripts/authorized-sample-readiness-ui-smoke.mjs",
  "scripts/authorized-alpha-analysis-smoke.mjs",
  "scripts/authorized-real-folder-smoke.mjs",
  "scripts/phase1-sample-smoke.mjs",
  "scripts/phase1-sample-ui-smoke.mjs",
  "scripts/phase2-report-contract-smoke.mjs",
  "scripts/phase2-report-ui-browser-smoke.mjs",
  "scripts/phase3-ball-trajectory-smoke.mjs",
  "scripts/phase3-ball-trajectory-ui-smoke.mjs",
  "scripts/phase4-multi-angle-smoke.mjs",
  "scripts/phase4-multi-angle-ui-smoke.mjs",
  "scripts/phase5-dynamic-lines-smoke.mjs",
  "scripts/phase5-browser-visual-smoke.mjs",
  "scripts/phase6-memory-smoke.mjs",
  "scripts/phase6-memory-ui-smoke.mjs",
  "scripts/phase7-privacy-smoke.mjs",
  "scripts/phase7-privacy-ui-smoke.mjs",
  "scripts/validate-body-angle-problem-mapping.mjs",
  "scripts/angle-knowledge-retrieval-smoke.mjs",
  "scripts/angle-knowledge-api-smoke.mjs",
  "scripts/mvp-acceptance-smoke.mjs"
];

const steps = [
  {
    name: "server --check",
    args: ["server/index.mjs", "--check"]
  },
  ...syntaxFiles.map((file) => ({
    name: `syntax ${file}`,
    args: ["--check", file],
    quiet: true
  })),
  {
    name: "mobile layout source smoke",
    args: ["scripts/mobile-layout-smoke.mjs"]
  },
  {
    name: "mobile browser smoke",
    args: ["scripts/mobile-browser-smoke.mjs"]
  },
  {
    name: "arc lab mobile browser smoke",
    args: ["scripts/mobile-browser-smoke.mjs", "--arc-lab"]
  },
  {
    name: "arc lab contract smoke",
    args: ["scripts/arc-lab-contract-smoke.mjs"]
  },
  {
    name: "arc lab workflow smoke",
    args: ["scripts/arc-lab-workflow-smoke.mjs"]
  },
  {
    name: "arc lab trend smoke",
    args: ["scripts/arc-lab-trend-smoke.mjs"]
  },
  {
    name: "arc lab knowledge assistant smoke",
    args: ["scripts/arc-lab-knowledge-assistant-smoke.mjs"]
  },
  {
    name: "arc lab knowledge directory smoke",
    args: ["scripts/arc-lab-knowledge-directory-smoke.mjs"]
  },
  {
    name: "arc lab platform smoke",
    args: ["scripts/arc-lab-platform-smoke.mjs"]
  },
  {
    name: "arc lab next platform scaffold smoke",
    args: ["scripts/arc-lab-next-platform-smoke.mjs"]
  },
  {
    name: "arc lab coach home smoke",
    args: ["scripts/arc-lab-coach-home-smoke.mjs"]
  },
  {
    name: "arc lab review smoke",
    args: ["scripts/arc-lab-review-smoke.mjs"]
  },
  {
    name: "arc lab audited deletion smoke",
    args: ["scripts/arc-lab-audited-deletion-smoke.mjs"]
  },
  {
    name: "arc lab pwa smoke",
    args: ["scripts/arc-lab-pwa-smoke.mjs"]
  },
  {
    name: "arc lab deployment readiness smoke",
    args: ["scripts/arc-lab-deployment-readiness-smoke.mjs"]
  },
  {
    name: "arc lab live trend smoke",
    args: ["scripts/arc-lab-live-trend-smoke.mjs"]
  },
  {
    name: "arc lab supabase production smoke",
    args: ["scripts/arc-lab-supabase-production-smoke.mjs"]
  },
  {
    name: "arc lab supabase sql sanity smoke",
    args: ["scripts/arc-lab-supabase-sql-sanity-smoke.mjs"]
  },
  {
    name: "arc lab supabase live verification smoke",
    args: ["scripts/arc-lab-supabase-live-verification-smoke.mjs"]
  },
  {
    name: "arc lab supabase RLS live verification smoke",
    args: ["scripts/arc-lab-supabase-rls-live-verification-smoke.mjs"]
  },
  {
    name: "arc lab supabase Storage live verification smoke",
    args: ["scripts/arc-lab-supabase-storage-live-verification-smoke.mjs"]
  },
  {
    name: "arc lab supabase Storage lifecycle verification smoke",
    args: ["scripts/arc-lab-supabase-storage-lifecycle-verification-smoke.mjs"]
  },
  {
    name: "boundary claims smoke",
    args: ["scripts/boundary-claims-smoke.mjs"]
  },
  {
    name: "body angle problem mapping validation",
    args: ["scripts/validate-body-angle-problem-mapping.mjs"]
  },
  {
    name: "angle knowledge retrieval smoke",
    args: ["scripts/angle-knowledge-retrieval-smoke.mjs"]
  },
  {
    name: "angle knowledge API smoke",
    args: ["scripts/angle-knowledge-api-smoke.mjs"]
  },
  {
    name: "phase completion audit",
    args: ["scripts/phase-completion-audit.mjs"],
    audit: true
  },
  {
    name: "sample manifest smoke",
    args: ["scripts/sample-manifest-smoke.mjs"]
  },
  {
    name: "authorized sample readiness smoke",
    args: ["scripts/authorized-sample-readiness-smoke.mjs"]
  },
  {
    name: "authorized sample readiness UI smoke",
    args: ["scripts/authorized-sample-readiness-ui-smoke.mjs"]
  },
  {
    name: "authorized alpha analysis smoke",
    args: ["scripts/authorized-alpha-analysis-smoke.mjs"]
  },
  {
    name: "phase 1 sample smoke",
    args: ["scripts/phase1-sample-smoke.mjs"]
  },
  {
    name: "phase 1 sample UI smoke",
    args: ["scripts/phase1-sample-ui-smoke.mjs"]
  },
  {
    name: "phase 2 report contract smoke",
    args: ["scripts/phase2-report-contract-smoke.mjs"]
  },
  {
    name: "phase 2 report UI browser smoke",
    args: ["scripts/phase2-report-ui-browser-smoke.mjs"]
  },
  {
    name: "phase 3 ball trajectory contract smoke",
    args: ["scripts/phase3-ball-trajectory-smoke.mjs"]
  },
  {
    name: "phase 3 ball trajectory UI browser smoke",
    args: ["scripts/phase3-ball-trajectory-ui-smoke.mjs"]
  },
  {
    name: "phase 4 multi-angle contract smoke",
    args: ["scripts/phase4-multi-angle-smoke.mjs"]
  },
  {
    name: "phase 4 multi-angle UI browser smoke",
    args: ["scripts/phase4-multi-angle-ui-smoke.mjs"]
  },
  {
    name: "phase 5 dynamic lines source smoke",
    args: ["scripts/phase5-dynamic-lines-smoke.mjs"]
  },
  {
    name: "phase 5 browser visual smoke",
    args: ["scripts/phase5-browser-visual-smoke.mjs"]
  },
  {
    name: "phase 6 memory contract smoke",
    args: ["scripts/phase6-memory-smoke.mjs"]
  },
  {
    name: "phase 6 memory UI browser smoke",
    args: ["scripts/phase6-memory-ui-smoke.mjs"]
  },
  {
    name: "phase 7 privacy contract smoke",
    args: ["scripts/phase7-privacy-smoke.mjs"]
  },
  {
    name: "phase 7 privacy UI browser smoke",
    args: ["scripts/phase7-privacy-ui-smoke.mjs"]
  }
];

const startedAt = Date.now();
const results = [];

for (const step of steps) {
  const result = await runStep(step);
  results.push(result);
  if (!step.quiet) {
    console.log(formatStepResult(result));
  }
}

const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
const smokeSteps = results.filter((item) => !item.step.quiet && !item.step.audit).length - 1;
const auditSteps = results.filter((item) => item.step.audit).length;
const retriedSteps = results
  .filter((item) => item.retry_count > 0)
  .map((item) => ({ name: item.step.name, retry_count: item.retry_count }));
console.log(JSON.stringify({
  ok: true,
  schema_version: "mvp_acceptance_smoke.v1",
  source_contract: "phase_1_to_7_local_acceptance_runner",
  command_count: steps.length,
  elapsed_seconds: elapsedSeconds,
  checked: {
    server_check: true,
    syntax_files: syntaxFiles.length,
    smoke_steps: smokeSteps,
    audit_steps: auditSteps,
    boundary_claims: true,
    phase_completion_audit: true,
    sample_manifest: true,
    authorized_sample_readiness: true,
    infrastructure_retries: retriedSteps.reduce((total, item) => total + item.retry_count, 0),
    retried_steps: retriedSteps
  },
  boundaries: [
    "local_only",
    "synthetic_or_authorized_samples_only",
    "no_paid_api_hard_dependency",
    "no_real_school_team_video_access"
  ]
}, null, 2));

async function runStep(step) {
  let lastError = null;
  let retryCount = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return {
        ...await runStepOnce(step),
        retry_count: retryCount
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3 && isRetryableInfrastructureFailure(error.message)) {
        retryCount += 1;
        console.warn(`[retry] ${step.name}: ${firstLine(error.message)}`);
        await sleep(3000 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function runStepOnce(step) {
  const started = Date.now();
  const child = spawn(nodeBin, step.args, {
    cwd: root,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "",
      YOLO_COMMAND: "",
      RTMPOSE_COMMAND: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  const elapsedSeconds = Number(((Date.now() - started) / 1000).toFixed(1));
  if (code !== 0) {
    const tail = `${stdout}\n${stderr}`.slice(-5000);
    throw new Error(`MVP acceptance failed at "${step.name}" with code ${code}\n${tail}`);
  }
  return {
    step,
    elapsedSeconds,
    summary: summarize(stdout)
  };
}

function isRetryableInfrastructureFailure(message) {
  return /Chrome exited before DevTools|Chrome DevTools did not become ready|server did not become ready|unsettled top-level await/i.test(message);
}

function firstLine(message) {
  return String(message || "").split("\n")[0].slice(0, 220);
}

function summarize(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    const payload = JSON.parse(trimmed);
    return {
      schema_version: payload.schema_version,
      source_contract: payload.source_contract,
      ok: payload.ok,
      knowledge_source_count: payload.knowledge_base?.source_count,
      viewport: payload.viewport,
      boundaries: payload.boundaries
    };
  } catch {
    return {
      text: trimmed.split("\n").slice(-3).join(" ").slice(0, 500)
    };
  }
}

function formatStepResult(result) {
  const parts = [
    `[ok] ${result.step.name}`,
    `${result.elapsedSeconds}s`
  ];
  if (result.summary.schema_version) parts.push(result.summary.schema_version);
  if (result.summary.source_contract) parts.push(result.summary.source_contract);
  if (result.summary.knowledge_source_count) parts.push(`source_count=${result.summary.knowledge_source_count}`);
  return parts.join(" | ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
