import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (key && value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
