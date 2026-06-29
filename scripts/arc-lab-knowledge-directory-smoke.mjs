import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateArcLabStudentKnowledgeDirectoryFlow } from "../server/arcLabIdentityStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const knowledgeBase = JSON.parse(await readFile(path.join(root, "distillation/douyin-shooting-coach/outputs/knowledge_base.json"), "utf8"));
const validation = validateArcLabStudentKnowledgeDirectoryFlow(knowledgeBase);

assert.equal(validation.ok, true, validation.errors.join("\n"));
assert.equal(validation.boundaries.phone_binding_required, true);
assert.equal(validation.boundaries.full_clean_directory_visible, true);
assert.equal(validation.boundaries.no_raw_source_cards, true);
assert.equal(validation.boundaries.no_student_question_storage, true);
assert(validation.checked_tables.includes("knowledge_articles"));

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_knowledge_directory_smoke.v1",
  source_contract: "bound_student_full_clean_knowledge_directory_without_raw_sources_or_question_log",
  checked_tables: validation.checked_tables,
  boundaries: validation.boundaries
}, null, 2));
