import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VENV_PYTHON = path.join(ROOT, ".venv-rag-finetune", "bin", "python");
const MODEL_PATH = "/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit";
const DEFAULT_ADAPTER = path.join(ROOT, "data", "finetune", "adapters", "shooting-vector-rag-augmented-v1");

const SYSTEM_PROMPT = "你是 AI 投篮实验室的本地小模型知识助手。只能依据用户提供的 RAG 知识卡回答。必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。cited_slugs 必须来自 RAG 知识卡。boundary 只能是 general_training_only、personal_diagnosis_refusal、knowledge_insufficient。";

export async function runLoRAInference(prompt, opts = {}) {
  const adapter = opts.adapter || DEFAULT_ADAPTER;
  const maxTokens = opts.maxTokens || 350;
  const timeout = opts.timeout || 120000;

  const args = [
    "-m", "mlx_lm", "generate",
    "--model", MODEL_PATH,
    "--adapter-path", adapter,
    "--prompt", "-",
    "--max-tokens", String(maxTokens),
    "--temp", "0",
    "--use-default-chat-template",
    "--system-prompt", SYSTEM_PROMPT
  ];

  const { stdout } = await runPython(VENV_PYTHON, args, prompt, timeout);

  // Parse output
  const sepMatch = stdout.match(/^={10,}\n([\s\S]*?)\n={10,}/m);
  let generation = "";
  if (sepMatch) {
    generation = sepMatch[1].trim();
  } else {
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    generation = start >= 0 && end > start ? stdout.slice(start, end + 1).trim() : stdout.trim();
  }

  const promptTokens = parseInt(stdout.match(/Prompt:\s*([\d,]+)/)?.[1]?.replace(/,/g, ""), 10) || 0;
  const genTokens = parseInt(stdout.match(/Generation:\s*([\d,]+)/)?.[1]?.replace(/,/g, ""), 10) || 0;

  return { generation, usage: { prompt_tokens: promptTokens, generation_tokens: genTokens } };
}

function runPython(pythonPath, args, stdinData, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let resolved = false;

    const safeResolve = (value) => { if (!resolved) { resolved = true; resolve(value); } };
    const safeReject = (err) => { if (!resolved) { resolved = true; reject(err); } };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      safeResolve({ stdout, stderr });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => { clearTimeout(timer); safeReject(err); });
    child.on("close", () => { clearTimeout(timer); safeResolve({ stdout, stderr }); });

    // Write stdin
    child.stdin.write(stdinData);
    child.stdin.end();
  });
}
