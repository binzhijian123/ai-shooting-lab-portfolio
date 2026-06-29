const KNOWLEDGE_RAG_SYSTEM_PROMPT = `
你是投篮实验室的学生训练知识助手。
- 只能依据提供的知识条目回答，不得补充条目之外的事实。
- 只回答通用训练知识，不根据个人视频或个人动作做诊断。
- 证据不足时明确说“当前知识库依据不足”。
- 使用简洁中文，给出可执行但不过度承诺的建议。
- 输出 JSON：{"answer":"...","cited_slugs":["..."]}。
`.trim();

export async function enrichStudentKnowledgeRagResponse({
  result,
  question,
  apiKey = process.env.DEEPSEEK_API_KEY,
  model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  fetchImpl = globalThis.fetch
} = {}) {
  const references = result?.answer?.student_visible_references || [];
  if (!result?.ok || result.answer?.answer_type !== "general_training_explanation_draft" || !references.length) {
    return result;
  }
  if (!apiKey || typeof fetchImpl !== "function") {
    return withGenerationMode(result, "local_grounded");
  }

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: KNOWLEDGE_RAG_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ question: String(question || ""), knowledge: references })
          }
        ],
        response_format: { type: "json_object" },
        stream: false,
        max_tokens: 800
      })
    });
    if (!response.ok) return withGenerationMode(result, "local_grounded");
    const data = await response.json();
    const generated = parseGeneratedAnswer(data.choices?.[0]?.message?.content);
    if (!generated) return withGenerationMode(result, "local_grounded");

    const allowedSlugs = new Set(references.map((reference) => reference.slug));
    const citedSlugs = generated.cited_slugs.filter((slug) => allowedSlugs.has(slug));
    return {
      ...result,
      answer: {
        ...result.answer,
        message: generated.answer,
        rag: {
          ...result.answer.rag,
          generation_mode: "deepseek_grounded",
          cited_slugs: citedSlugs
        }
      }
    };
  } catch {
    return withGenerationMode(result, "local_grounded");
  }
}

function parseGeneratedAnswer(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  try {
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    return {
      answer: parsed.answer.trim(),
      cited_slugs: Array.isArray(parsed.cited_slugs) ? parsed.cited_slugs.filter((slug) => typeof slug === "string") : []
    };
  } catch {
    return null;
  }
}

function withGenerationMode(result, generationMode) {
  return {
    ...result,
    answer: {
      ...result.answer,
      rag: {
        ...result.answer.rag,
        generation_mode: generationMode,
        cited_slugs: []
      }
    }
  };
}
