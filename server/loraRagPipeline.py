#!/usr/bin/env python3
"""
完整的 RAG + LoRA 推理管道
输入：stdin JSON: {"question": "..."}
输出：stdout JSON: {"answer": {...}, "retrieval": {...}, "model_source": "lora", "usage": {...}}

一次 Python 调用完成向量 RAG embedding + LoRA 推理，避免 Node 多次 spawn。
"""

import json, sys, os, re, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = "/Users/bzj/models/qwen-mlx/Qwen2.5-0.5B-Instruct-4bit"
ADAPTER_PATH = os.path.join(ROOT, "data", "finetune", "adapters", "shooting-vector-rag-augmented-v1")
INDEX_PATH = os.path.join(ROOT, "data", "rag", "vector_index.json")
VENV_PYTHON = os.path.join(ROOT, ".venv-rag-finetune", "bin", "python")

SYSTEM_PROMPT = "你是 AI 投篮实验室的本地小模型知识助手。只能依据用户提供的 RAG 知识卡回答。必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。cited_slugs 必须来自 RAG 知识卡。boundary 只能是 general_training_only、personal_diagnosis_refusal、knowledge_insufficient。"

PERSONAL_PATTERNS = [
    re.compile(r"帮我看看"), re.compile(r"你觉得我"), re.compile(r"帮我分析"),
    re.compile(r"我的投篮"), re.compile(r"适合我吗"), re.compile(r"我是不是"),
    re.compile(r"给我看看"), re.compile(r"帮我检查"), re.compile(r"我的动作"),
    re.compile(r"看我的"), re.compile(r"分析我的"), re.compile(r"我的视频")
]

DOMAIN_SIGNAL_TERMS = [
    "起球", "收球", "沉球", "手肘", "肘", "手腕", "压腕", "拨球", "辅助手",
    "主视眼", "瞄准", "球路", "力线", "发力", "下肢", "髋", "膝", "脚踝",
    "躯干", "核心", "出手", "弧线", "弧度", "节奏", "时序", "一段式", "二段式",
    "侧面", "正面", "重心", "前倾", "跳投", "三分", "近筐", "投篮"
]


def is_personal_diagnosis(question):
    return any(p.search(question) for p in PERSONAL_PATTERNS)


def has_domain_signal(question):
    q = question.lower()
    return any(term in q for term in DOMAIN_SIGNAL_TERMS)


def load_vector_index():
    with open(INDEX_PATH, "r") as f:
        return json.load(f)


def embed_text(texts, mode="query"):
    """调用 embedding 模型"""
    script = os.path.join(ROOT, "scripts", "embed-texts.py")
    result = subprocess.run(
        [VENV_PYTHON, script,
         "--model", "BAAI/bge-small-zh-v1.5",
         "--mode", mode,
         "--local-files-only",
         "--batch-size", "1"],
        input=json.dumps({"texts": texts}),
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(f"Embedding failed: {result.stderr[:500]}")
    return json.loads(result.stdout)


def build_document_text(chunk):
    parts = [
        f"标题：{chunk.get('title', '')}",
        f"摘要：{chunk.get('summary', '')}",
        f"标签：{' '.join(chunk.get('tags', []))}",
        "诊断规则："
    ]
    for rule in chunk.get("diagnosis_rules", []):
        parts.append(f"如果：{rule.get('if', '')}")
        parts.append(f"那么：{rule.get('then', '')}")
        parts.append(f"检查：{rule.get('check', '')}")
        parts.append(f"修复：{rule.get('repair', '')}")
    parts.append("训练动作：")
    for action in chunk.get("repair_actions", []):
        parts.append(f"练习：{action.get('drill', '')}")
        parts.append(f"剂量：{action.get('dosage', '')}")
        parts.append(f"提示：{action.get('cue', '')}")
        parts.append(f"成功标准：{action.get('success_metric', '')}")
    return re.sub(r"\s+", " ", "\n".join(parts)).strip()


def cosine_similarity(q_emb, doc_emb):
    dot = sum(a * b for a, b in zip(q_emb, doc_emb))
    q_norm = sum(a * a for a in q_emb) ** 0.5
    d_norm = sum(b * b for b in doc_emb) ** 0.5
    if q_norm == 0 or d_norm == 0:
        return 0.0
    return dot / (q_norm * d_norm)


def retrieve(question, index, top_k=5):
    """向量 RAG 检索"""
    chunks = index.get("chunks", [])
    if not chunks or not has_domain_signal(question):
        return []
    
    # Embed query
    emb_result = embed_text([question], mode="query")
    query_emb = emb_result["embeddings"][0]
    
    # Compute scores
    scored = []
    for chunk in chunks:
        score = cosine_similarity(query_emb, chunk.get("embedding", []))
        if score >= 0.35:
            scored.append((score, chunk))
    
    scored.sort(key=lambda x: -x[0])
    top = scored[:top_k]
    
    return [
        {
            "slug": c["slug"], "score": s,
            "title": c.get("title", ""),
            "summary": c.get("summary", ""),
            "tags": c.get("tags", []),
            "diagnosis_rules": c.get("diagnosis_rules", []),
            "repair_actions": c.get("repair_actions", [])
        }
        for s, c in top
    ]


def deduplicate(text):
    if not text or len(text) < 10:
        return text
    parts = re.split(r"(?<=[。！？；\n])", text)
    if len(parts) <= 2:
        return text
    seen = set()
    unique = []
    for part in parts:
        t = part.strip()
        if not t:
            continue
        if len(t) >= 8 and t in seen:
            continue
        if len(t) >= 8:
            seen.add(t)
        unique.append(part)
    return "".join(unique).strip()


def run_lora_inference(prompt, max_tokens=350):
    """调用 mlx_lm 生成"""
    result = subprocess.run(
        [VENV_PYTHON, "-m", "mlx_lm", "generate",
         "--model", MODEL_PATH,
         "--adapter-path", ADAPTER_PATH,
         "--prompt", "-",
         "--max-tokens", str(max_tokens),
         "--temp", "0",
         "--use-default-chat-template",
         "--system-prompt", SYSTEM_PROMPT],
        input=prompt,
        capture_output=True, text=True, timeout=300
    )
    stdout = result.stdout
    
    # Extract JSON
    m = re.search(r"^={10,}\n(.+?)\n={10,}", stdout, re.DOTALL | re.MULTILINE)
    raw = m.group(1).strip() if m else ""
    if not raw:
        start = stdout.find("{")
        end = stdout.rfind("}")
        raw = stdout[start:end+1].strip() if start >= 0 and end > start else stdout.strip()
    
    # Token usage
    prompt_t = 0
    gen_t = 0
    pm = re.search(r"Prompt:\s*([\d,]+)\s*tokens", stdout)
    if pm: prompt_t = int(pm.group(1).replace(",", ""))
    gm = re.search(r"Generation:\s*([\d,]+)\s*tokens", stdout)
    if gm: gen_t = int(gm.group(1).replace(",", ""))
    
    return raw, {"prompt_tokens": prompt_t, "generation_tokens": gen_t}


def main():
    payload = json.load(sys.stdin)
    question = payload.get("question", "").strip()
    
    if not question:
        print(json.dumps({"ok": False, "error": "missing_question"}, ensure_ascii=False))
        return
    
    try:
        index = load_vector_index()
    except Exception as e:
        print(json.dumps({"ok": False, "error": "vector_index_not_found", "message": str(e)}, ensure_ascii=False))
        return
    
    # 个人诊断 - 直接拒答
    if is_personal_diagnosis(question):
        resp = {
            "ok": True,
            "schema_version": "local_rag_coach_response.v1",
            "question": question,
            "retrieval": {"method": index.get("source_contract", ""), "top_k": 0, "matches": []},
            "answer": {
                "answer": "个人视频或个人动作的最终诊断需要教练结合视频证据确认。这里可以解释通用训练知识、拍摄要求或知识库里的训练概念。",
                "cited_slugs": [], "confidence": "low", "boundary": "personal_diagnosis_refusal"
            },
            "model_source": "heuristic_fallback",
            "usage": {"prompt_tokens": 0, "generation_tokens": 0}
        }
        print(json.dumps(resp, ensure_ascii=False))
        return
    
    # 向量 RAG 检索
    matches = retrieve(question, index)
    retrieved_cards = [
        {"slug": m["slug"], "score": m["score"], "title": m["title"], "summary": m["summary"]}
        for m in matches
    ]
    
    if not matches:
        resp = {
            "ok": True,
            "schema_version": "local_rag_coach_response.v1",
            "question": question,
            "retrieval": {"method": index.get("source_contract", ""), "top_k": 0, "matches": []},
            "answer": {"answer": "当前知识库没有直接相关依据", "cited_slugs": [], "confidence": "low", "boundary": "knowledge_insufficient"},
            "model_source": "heuristic_fallback",
            "usage": {"prompt_tokens": 0, "generation_tokens": 0}
        }
        print(json.dumps(resp, ensure_ascii=False))
        return
    
    # LoRA 推理
    top_cards = matches[:3]
    cards_json = json.dumps([
        {"slug": c["slug"], "title": c["title"], "summary": c["summary"],
         "diagnosis_rules": c.get("diagnosis_rules", []), "repair_actions": c.get("repair_actions", [])}
        for c in top_cards
    ], ensure_ascii=False, indent=2)
    prompt = f"问题：{question}\nRAG 知识卡：\n{cards_json}\n请只依据这些知识卡输出 JSON。"
    
    max_tokens = payload.get("maxTokens", 350)
    generation, usage = run_lora_inference(prompt, max_tokens)
    
    # 解析 JSON
    try:
        parsed = json.loads(generation)
    except json.JSONDecodeError:
        resp = {
            "ok": True,
            "schema_version": "local_rag_coach_response.v1",
            "question": question,
            "retrieval": {"method": index.get("source_contract", ""), "top_k": len(matches), "matches": retrieved_cards},
            "answer": {"answer": "请参考以上知识卡相关内容。", "cited_slugs": [m["slug"] for m in matches[:3]], "confidence": "low", "boundary": "general_training_only"},
            "raw_generation": generation,
            "model_source": "lora_fallback",
            "usage": usage
        }
        print(json.dumps(resp, ensure_ascii=False))
        return
    
    # 后处理
    valid_slugs = {m["slug"] for m in matches}
    max_score = matches[0]["score"] if matches else 0
    filtered_slugs = [s for s in parsed.get("cited_slugs", []) if s in valid_slugs]
    
    confidence = parsed.get("confidence", "low")
    if confidence not in ("high", "medium", "low"):
        if max_score >= 0.45: confidence = "high"
        elif max_score >= 0.35: confidence = "medium"
        else: confidence = "low"
    
    boundary = parsed.get("boundary", "general_training_only")
    if boundary not in ("general_training_only", "personal_diagnosis_refusal", "knowledge_insufficient"):
        boundary = "general_training_only"
    
    answer_text = deduplicate(parsed.get("answer", ""))
    if not answer_text or len(answer_text) < 5:
        answer_text = "请参考以上知识卡相关内容。"
    
    resp = {
        "ok": True,
        "schema_version": "local_rag_coach_response.v1",
        "question": question,
        "retrieval": {"method": index.get("source_contract", ""), "top_k": len(matches), "matches": retrieved_cards},
        "answer": {
            "answer": answer_text,
            "cited_slugs": filtered_slugs if filtered_slugs else [m["slug"] for m in matches[:3]],
            "confidence": confidence,
            "boundary": boundary
        },
        "model_source": "lora",
        "usage": usage
    }
    print(json.dumps(resp, ensure_ascii=False))


if __name__ == "__main__":
    main()
