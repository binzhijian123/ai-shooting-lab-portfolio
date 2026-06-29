import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStudentKnowledgeAssistantResponse,
  buildStudentKnowledgeDirectory,
  classifyStudentKnowledgeQuestion,
  retrieveStudentKnowledgeArticles,
  summarizeArcLabKnowledgeAssistantContract,
  validateArcLabKnowledgeAssistantContract
} from "../server/arcLabKnowledgeAssistant.mjs";
import { enrichStudentKnowledgeRagResponse } from "../server/knowledgeRag.mjs";
import { validateArcLabStudentKnowledgeUsageFlow } from "../server/arcLabIdentityStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const knowledgeBase = JSON.parse(await readFile(
  path.join(root, "distillation", "douyin-shooting-coach", "outputs", "knowledge_base.json"),
  "utf8"
));

const validation = validateArcLabKnowledgeAssistantContract(knowledgeBase);
assert.equal(validation.ok, true, validation.errors.join("\n"));
const usageValidation = validateArcLabStudentKnowledgeUsageFlow(knowledgeBase);
assert.equal(usageValidation.ok, true, usageValidation.errors.join("\n"));

const summary = summarizeArcLabKnowledgeAssistantContract();
assert.equal(summary.schema_version, "arc_lab_knowledge_assistant_contract.v1");
assert.equal(summary.personal_video_diagnosis_allowed, false);
assert.equal(summary.saves_student_questions, false);
assert.equal(summary.chat_history_in_mvp, false);
assert.equal(summary.question_log_visible_to_coach, false);
assert.equal(summary.exposes_raw_source_cards_to_students, false);
assert.equal(summary.retrieval_augmented_generation, true);
assert.equal(summary.retrieval_method, "hybrid_lexical_v1");
assert.equal(summary.default_daily_ai_answer_limit, 20);

const personalClassification = classifyStudentKnowledgeQuestion("我的视频是不是手快脚慢？");
assert.equal(personalClassification.allowed, false);
assert.equal(personalClassification.category, "personal_video_diagnosis");

const filmingClassification = classifyStudentKnowledgeQuestion("怎么拍 side view 投篮视频？");
assert.equal(filmingClassification.allowed, true);
assert.equal(filmingClassification.category, "filming_requirement");

const personalResponse = buildStudentKnowledgeAssistantResponse({
  question: "帮我分析我的投篮视频有什么问题",
  knowledgeBase,
  ai_answer_count_today: 0
});
assert.equal(personalResponse.ok, false);
assert.equal(personalResponse.answer_type, "boundary_refusal");
assert.equal(personalResponse.usage.saves_student_question, false);
assert.equal(personalResponse.usage.chat_history_written, false);
assert.equal(personalResponse.usage.question_log_visible_to_coach, false);
assert(personalResponse.hidden_from_student.includes("raw_ai_diagnosis"));

const generalResponse = buildStudentKnowledgeAssistantResponse({
  question: "低位到高位起球怎么做？",
  knowledgeBase,
  ai_answer_count_today: 2
});
assert.equal(generalResponse.ok, true);
assert.equal(generalResponse.answer_type, "general_training_explanation_draft");
assert.equal(generalResponse.usage.ai_answer_count_after_response, 3);
assert(generalResponse.student_visible_references.length > 0);
assert.equal(generalResponse.rag.retrieval_method, "hybrid_lexical_v1");
assert.equal(generalResponse.rag.generation_mode, "local_grounded");
assert(generalResponse.student_visible_references.some((reference) => (
  `${reference.title} ${reference.summary}`.includes("起球")
)));
assert.equal(generalResponse.student_visible_references.some((reference) => reference.summary.includes("不包含投篮技术")), false);

const retrieved = retrieveStudentKnowledgeArticles("低位到高位起球怎么做？", knowledgeBase, { limit: 3 });
assert(retrieved.length > 0);
assert(retrieved.length <= 3);
assert(retrieved.some((reference) => JSON.stringify(reference).includes("起球")));
for (const reference of retrieved) {
  assert.equal(Object.hasOwn(reference, "source_url"), false);
  assert.equal(Object.hasOwn(reference, "source_card_id"), false);
  assert.equal(Object.hasOwn(reference, "core_rules"), false);
  assert.equal(Object.hasOwn(reference, "key_points"), false);
}

const filmingReferences = retrieveStudentKnowledgeArticles("怎么拍 side view 投篮视频？", knowledgeBase, { limit: 3 });
assert.equal(filmingReferences[0].slug, "filming-side");
assert.equal(filmingReferences[0].content_type, "filming_requirement");

const unknownResponse = buildStudentKnowledgeAssistantResponse({
  question: "量子力学中的纠缠是什么意思？",
  knowledgeBase,
  ai_answer_count_today: 0
});
assert.equal(unknownResponse.student_visible_references.length, 0);
assert.match(unknownResponse.message, /依据/);

let requestPayload;
const generatedResponse = await enrichStudentKnowledgeRagResponse({
  result: { ok: true, answer: generalResponse },
  question: "低位到高位起球怎么做？",
  apiKey: "test-key",
  fetchImpl: async (_url, init) => {
    requestPayload = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                answer: "知识库建议让沉球、下肢启动与起球保持连续。",
                cited_slugs: [generalResponse.student_visible_references[0].slug]
              })
            }
          }]
        };
      }
    };
  }
});
assert.equal(generatedResponse.answer.rag.generation_mode, "deepseek_grounded");
assert.equal(generatedResponse.answer.rag.cited_slugs.length, 1);
assert.match(generatedResponse.answer.message, /知识库建议/);
assert.equal(JSON.stringify(requestPayload).includes("source_card_id"), false);
assert.equal(JSON.stringify(requestPayload).includes("source_url"), false);

const limitedResponse = buildStudentKnowledgeAssistantResponse({
  question: "近筐节奏投为什么重要？",
  knowledgeBase,
  ai_answer_count_today: 20
});
assert.equal(limitedResponse.ok, false);
assert.equal(limitedResponse.answer_type, "rate_limited");

const directory = buildStudentKnowledgeDirectory(knowledgeBase, { limit: 3 });
assert(directory.articles.length >= 9);
for (const article of directory.articles) {
  assert.equal(Object.hasOwn(article, "id"), false);
  assert.equal(Object.hasOwn(article, "source_url"), false);
  assert.equal(Object.hasOwn(article, "source_card_path"), false);
  assert.equal(Object.hasOwn(article, "diagnosis_rules"), false);
  assert.equal(Object.hasOwn(article, "false_positives"), false);
}

console.log(JSON.stringify({
  ok: true,
  schema_version: "arc_lab_knowledge_assistant_smoke.v1",
  source_contract: "student_knowledge_assistant_general_training_only",
  clean_article_count: directory.articles.length,
  personal_diagnosis: {
    allowed: personalClassification.allowed,
    answer_type: personalResponse.answer_type,
    saves_student_question: personalResponse.usage.saves_student_question
  },
  general_question: {
    allowed: generalResponse.classification.allowed,
    answer_type: generalResponse.answer_type,
    reference_count: generalResponse.student_visible_references.length,
    retrieval_method: generalResponse.rag.retrieval_method,
    generation_mode: generatedResponse.answer.rag.generation_mode
  },
  rate_limit: {
    answer_type: limitedResponse.answer_type,
    daily_limit: limitedResponse.usage.daily_limit
  },
  usage_counter: {
    schema_version: usageValidation.schema_version,
    checked_tables: usageValidation.checked_tables,
    daily_ai_answer_limit: usageValidation.boundaries.daily_ai_answer_limit
  },
  boundaries: [
    "general_training_knowledge_only",
    "no_personal_video_diagnosis",
    "no_student_question_storage",
    "no_chat_history",
    "no_raw_source_cards_to_students",
    "daily_usage_counter_persisted_without_question_text"
  ]
}, null, 2));
