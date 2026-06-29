import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const explicitFiles = [
  "README.md",
  "Product-Spec.md",
  "Current-System-Audit.md",
  "Acceptance-Baseline.md",
  "DEV-PLAN.md",
  "Goal-Backlog.md",
  "Ball-Trajectory-Spec.md",
  "Privacy-And-Data-Policy-Draft.md",
  "Report-Schema.md",
  "Video-Analysis-Input-Contract.md",
  "Scoring-Research-Plan.md",
  "app/index.html",
  "app/main.js",
  "server/index.mjs",
  "server/visionPipeline.mjs",
  "server/promptPolicy.mjs"
];

const requiredBoundaryTexts = [
  {
    file: "Product-Spec.md",
    needles: [
      "第一版不承诺登录、账号体系、云端同步",
      "第一版不承诺稳定 2D 球轨迹",
      "第一版不承诺最终评分公式"
    ]
  },
  {
    file: "Ball-Trajectory-Spec.md",
    needles: [
      "不得把当前 YOLO 启发式写成稳定 2D 球轨迹能力",
      "不证明真实视频稳定 2D 球轨迹"
    ]
  },
  {
    file: "Privacy-And-Data-Policy-Draft.md",
    needles: [
      "登录、账号、云端同步和跨设备恢复是后续目标，不是当前已实现事实",
      "真实校队视频默认不得",
      "本地 JSON 导出只覆盖 SQLite session、记忆摘要和上传文件清单元数据，不导出原始视频字节"
    ]
  },
  {
    file: "Acceptance-Baseline.md",
    needles: [
      "文档、UI 和报告不得把以下内容写成已完成事实",
      "真实校队视频可公开展示、外部分发、云端保存或训练模型"
    ]
  },
  {
    file: "app/main.js",
    needles: [
      "不是稳定 2D 球轨迹承诺",
      "未实现即不可承诺"
    ]
  }
];

const riskyClaims = [
  {
    id: "login_account_cloud_completed",
    regex: /(登录|账号|account|login|cloud sync|cloud_sync|云端同步).{0,50}(已完成|完成|implemented|enabled|ready|available)/i
  },
  {
    id: "stable_ball_trajectory_completed",
    regex: /(稳定\s*2D\s*球轨迹|stable\s*(2d\s*)?(ball\s*)?(trajectory|tracking)|稳定命中|稳定未中|confirmed_make|confirmed_miss).{0,50}(已完成|完成|implemented|enabled|ready|available|承诺|confirmed)/i
  },
  {
    id: "final_scoring_formula_completed",
    regex: /(最终评分公式|评分公式|final scoring formula).{0,50}(已完成|完成|implemented|enabled|ready|available|确定|final)/i
  },
  {
    id: "real_team_video_allowed_without_auth",
    regex: /(真实校队视频|real school-team video|real team video).{0,80}(公开展示|外部分发|云端保存|训练模型|public_showcase|external_distribution|cloud_storage|model_training).{0,50}(已完成|允许|默认|enabled|available|allowed)/i
  }
];

const negativeQualifiers = [
  "不",
  "不得",
  "不能",
  "未",
  "没有",
  "不是",
  "不承诺",
  "不要求",
  "后续",
  "待确认",
  "待验收",
  "待实现",
  "禁止",
  "防止",
  "避免",
  "unless",
  "not",
  "no ",
  "without",
  "not_implemented",
  "not implemented",
  "future",
  "remaining gap",
  "does not",
  "must not"
];

const files = [...explicitFiles, ...await markdownFiles("docs")];
const findings = [];
const checkedFiles = [];

for (const file of unique(files)) {
  const absolute = path.join(root, file);
  let text = "";
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    continue;
  }
  checkedFiles.push(file);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const claim of riskyClaims) {
      if (!claim.regex.test(line)) continue;
      if (hasNegativeQualifier(line)) continue;
      findings.push({
        file,
        line: index + 1,
        id: claim.id,
        text: line.trim().slice(0, 220)
      });
    }
  });
}

const missingRequired = [];
for (const item of requiredBoundaryTexts) {
  const absolute = path.join(root, item.file);
  const text = await readFile(absolute, "utf8");
  for (const needle of item.needles) {
    if (!text.includes(needle)) {
      missingRequired.push({ file: item.file, needle });
    }
  }
}

if (findings.length || missingRequired.length) {
  console.error(JSON.stringify({
    ok: false,
    schema_version: "boundary_claims_smoke.v1",
    findings,
    missing_required_boundary_texts: missingRequired
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "boundary_claims_smoke.v1",
  source_contract: "no_false_completed_claims_for_mvp_boundaries",
  checked_files: checkedFiles.length,
  risky_claim_patterns: riskyClaims.map((item) => item.id),
  required_boundary_text_groups: requiredBoundaryTexts.length,
  boundaries: [
    "login_account_cloud_not_current",
    "stable_ball_trajectory_not_current",
    "final_scoring_formula_not_current",
    "real_team_video_forbidden_uses_preserved"
  ]
}, null, 2));

async function markdownFiles(dirName) {
  const dir = path.join(root, dirName);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `${dirName}/${entry.name}`);
}

function hasNegativeQualifier(line) {
  const normalized = line.toLowerCase();
  return negativeQualifiers.some((item) => normalized.includes(item.toLowerCase()));
}

function unique(items) {
  return [...new Set(items)];
}
