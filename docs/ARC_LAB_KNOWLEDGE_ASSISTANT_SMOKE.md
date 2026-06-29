# Arc Lab Knowledge Assistant Smoke

Updated: 2026-06-26

## Purpose

This smoke test verifies the MVP boundary for the paid student training knowledge assistant.

It keeps the assistant outside the core diagnosis loop:

- Students can ask general training knowledge questions.
- Students can ask how to film side/front/back videos.
- Personal video diagnosis questions are refused.
- Student questions are not saved.
- MVP chat history is not written.
- Coaches do not see student question logs.
- Student-facing references do not expose raw Douyin sources, source card IDs, raw rule cards, diagnosis rules, false-positive details, or professional evidence rules.
- AI explanation responses respect the default 20-per-student-per-day limit.

## Files

- `server/arcLabKnowledgeAssistant.mjs`
- `scripts/arc-lab-knowledge-assistant-smoke.mjs`

## Command

```bash
/Users/bzj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/arc-lab-knowledge-assistant-smoke.mjs
```

## Latest Result

Passed on 2026-06-26.

Latest output included:

- `schema_version=arc_lab_knowledge_assistant_smoke.v1`
- `source_contract=student_knowledge_assistant_general_training_only`
- `clean_article_count=12`
- personal diagnosis question: `allowed=false`, `answer_type=boundary_refusal`, `saves_student_question=false`
- general question: `allowed=true`, `answer_type=general_training_explanation_draft`
- rate limit: `answer_type=rate_limited`, `daily_limit=20`

## Boundaries

This does not implement production login, payments, Supabase usage rows, chat history, LLM calls, or a production student PWA screen.

It is a local behavior contract for the PRD boundary that student knowledge search and AI explanation must not become personal video diagnosis.
