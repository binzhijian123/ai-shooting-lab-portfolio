/**
 * 独立的 RAG + LoRA 问答 API 服务器
 * 单一 Python 子进程 = 完整管道，避免多次 spawn。
 * 启动：node server/loraApiServer.mjs
 * 端口：4175
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VENV_PYTHON = path.join(ROOT, ".venv-rag-finetune", "bin", "python");
const PIPELINE_SCRIPT = path.join(ROOT, "server", "loraRagPipeline.py");
const PORT = Number(process.env.LORA_API_PORT || 4175);

process.on("uncaughtException", (err) => { console.error("Uncaught:", err.message); });
process.on("unhandledRejection", (reason) => { console.error("Unhandled:", reason); });

function callPipeline(question, maxTokens = 350) {
  return new Promise((resolve, reject) => {
    const child = spawn(VENV_PYTHON, [PIPELINE_SCRIPT], { stdio: ["pipe", "pipe", "pipe"], timeout: 300000 });
    let stdout = "", stderr = "";
    let resolved = false;
    const timer = setTimeout(() => { if (!resolved) { resolved = true; child.kill("SIGTERM"); reject(new Error("Pipeline timeout")); } }, 300000);

    child.stdout.on("data", (c) => stdout += c);
    child.stderr.on("data", (c) => stderr += c);
    child.on("error", (err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(err); } });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        if (code === 0) {
          try { resolve(JSON.parse(stdout)); }
          catch (e) { reject(new Error(`Invalid JSON: ${e.message} | stdout: ${stdout.slice(0, 300)}`)); }
        } else {
          reject(new Error(`Pipeline failed (code ${code}): ${stderr.slice(0, 500)}`));
        }
      }
    });

    child.stdin.write(JSON.stringify({ question, maxTokens }));
    child.stdin.end();
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data, null, 2));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end(); return;
  }
  if (req.url === "/health" && req.method === "GET") {
    return sendJson(res, { ok: true, status: "alive", port: PORT });
  }
  if (req.url === "/api/local-rag-coach" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return sendJson(res, { ok: false, error: "invalid_json" }, 400); }
    const question = (body.question || "").trim();
    if (!question) return sendJson(res, { ok: false, error: "missing_question" }, 400);
    try {
      const result = await callPipeline(question, body.maxTokens || 350);
      return sendJson(res, result);
    } catch (err) {
      console.error("Error:", err.message);
      return sendJson(res, { ok: false, error: "pipeline_error", message: err.message }, 500);
    }
  }
  sendJson(res, { ok: false, error: "not_found" }, 404);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LoRA Coach API running at http://localhost:${PORT}`);
  console.log(`  POST /api/local-rag-coach  {"question":"..."}`);
  console.log(`  GET  /health`);
});
