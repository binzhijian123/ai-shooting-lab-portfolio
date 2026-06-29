import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SYSTEM_PROMPT = [
  "你是 AI 投篮实验室的本地小模型知识助手。",
  "只能依据用户提供的 RAG 知识卡回答，不能补充知识卡之外的事实。",
  "只回答通用训练知识，不根据个人视频或个人动作做最终诊断。",
  "必须输出 JSON，字段为 answer、cited_slugs、confidence、boundary。",
  "cited_slugs 只能引用输入知识卡中的 slug；证据不足时 cited_slugs 为空。"
].join("\n");

const REFUSAL_EXAMPLES = [
  {
    question: "帮我分析我的投篮视频是不是手肘外翻？",
    answer: "这个问题涉及个人视频分析，不能只凭一句话下结论。通用知识来说，手肘外翻可以通过正面视频自查：看肘部是否明显偏离肩-腕连线。如果要确认，需要教练结合视频帧判断。",
    cited_slugs: ["kb-douyin_6883319596607081736"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "你直接诊断一下我的动作问题。",
    answer: "我不能在没有视频证据和教练复核的情况下给你做个人动作诊断。可以把问题拆成通用自查项：起球时序、手肘方向、重心是否前倾、出手时机和球路是否偏移。如果你提供结构化证据，再按 RAG 知识卡解释可能原因。",
    cited_slugs: [],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "你觉得我是不是应该改成库里的投篮姿势？",
    answer: "投篮姿势是否应该改变需要教练结合你的视频、身体条件和目标来评估。通用建议是：如果你当前命中率高且动作稳定，不一定需要大改。通用训练上可以学习库里发力理念（上下肢协同），但不要盲目模仿。",
    cited_slugs: ["kb-douyin_7356445386128575770"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "我的投篮为什么不准？帮我分析一下",
    answer: "投篮不准的原因有很多种可能，需要视频证据和教练复核才能诊断。你可以先从通用自查开始：检查起球是否沿身体中线、手肘是否外翻、下肢发力是否充分、出手方向是否稳定。具体诊断需要结合你的视频帧信息。",
    cited_slugs: [],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "帮我看看我发力脱节的问题怎么治？",
    answer: "发力脱节的具体治疗需要看到你的视频证据才能判断。通用知识来看，发力脱节通常表现在上下肢时序不同步。通用训练时可以做\"沉球-降重心-停顿\"分解练习，让下肢先启动再带动上肢。具体调整需要结合你的情况。",
    cited_slugs: ["kb-douyin_7063051650348485920"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "你觉得库里一段式投篮适合我吗？",
    answer: "一段式投篮是否适合你取决于多个因素：你的身高、力量水平、投篮习惯和比赛风格。这需要教练综合评估。通用知识来说，一段式投篮出手更快、更适合远投，但需要上下肢协调性好。不适合在没有专业指导的情况下盲目切换。",
    cited_slugs: ["kb-douyin_7245852732790197542"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "我手快脚慢要怎么改？帮我看看我的节奏问题",
    answer: "手快脚慢的节奏问题需要看视频才能确定具体原因。通用训练知识：如果上下肢时序脱节，先做\"沉球-降重心-停顿\"练习，再过度到\"被动举球\"。但你的具体改法需要教练根据你的视频动作来判断。",
    cited_slugs: ["kb-douyin_7063051650348485920"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "你能直接告诉我我该不该改动作吗？",
    answer: "不能。动作是否需要改动以及如何改动，需要教练结合多角度视频、你的比赛表现和身体条件来综合判断。你可以先通过通用自查了解目前动作可能存在的问题，但最终诊断需要专业复核。",
    cited_slugs: [],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "教练你看我这两天的训练视频，我手肘是不是有问题？",
    answer: "这个问题涉及具体的个人视频分析。通用知识来说，手肘问题可以通过正面和侧面视频自查：正面看肘部是否偏离肩-腕连线，侧面看肘部高度和角度是否正常。但你的具体情况需要教练结合视频帧来判断。",
    cited_slugs: ["kb-douyin_6883319596607081736"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  },
  {
    question: "我是不是该改成侧身站位？",
    answer: "站位的选择取决于你的身体结构、投篮习惯和比赛方式。这需要教练评估。通用知识来说，侧身站位有利于肩膀对齐和直线发力，但正身站位更适合某些射手（如纳什）。选择哪种需要结合你的具体动作来看。",
    cited_slugs: ["kb-douyin_7370033421001993511"],
    confidence: "low",
    boundary: "personal_diagnosis_refusal"
  }
];

const INSUFFICIENT_EXAMPLES = [
  {
    question: "量子力学纠缠和投篮有什么关系？",
    answer: "当前知识库没有直接相关依据。现有知识卡围绕投篮动作、发力链、起球线路、压腕、重心和拍摄视角，不包含量子力学纠缠相关内容。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "投篮时应该吃什么补剂提升命中率？",
    answer: "当前知识库没有直接相关依据。现有 RAG 知识卡主要讨论投篮技术和训练动作，没有提供补剂、营养或医学建议。这个问题不适合作为投篮动作知识回答。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "如何通过训练让弹跳增加30厘米？",
    answer: "当前知识库没有直接相关依据。现有知识卡主要讨论投篮技术细节，不包含弹跳训练或爆发力训练的具体方案。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "跑步机的速度设置应该怎么调？",
    answer: "当前知识库没有直接相关依据。现有知识卡围绕篮球投篮技术展开，不包含跑步机设置或体能训练器械操作内容。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "中国男篮什么时候能拿奥运金牌？",
    answer: "当前知识库没有直接相关依据。现有知识卡围绕投篮技术分析和训练方法展开，不包含国际篮球赛事预测和历史分析内容。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "乔丹在耐克的合同金额是多少？",
    answer: "当前知识库没有直接相关依据。现有 RAG 知识卡主要讨论投篮动作、发力链和训练方法，不包含商业合同信息。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "NBA历史上三分最准的球员是谁？",
    answer: "当前知识库没有直接相关依据。现有知识卡围绕投篮技术原理和训练方法，不包含历史数据统计或球员排名信息。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "今天天气怎么样，适合打球吗？",
    answer: "当前知识库没有直接相关依据。现有知识卡围绕篮球投篮技术分析，不包含天气预报或户外运动建议。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "你认识库里吗？他今年多大了？",
    answer: "当前知识库没有直接相关依据。现有知识卡虽然涉及库里投篮技术分析，但不包含球员个人资料、年龄或传记信息。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  },
  {
    question: "怎么挑选适合自己的篮球鞋？",
    answer: "当前知识库没有直接相关依据。现有知识卡主要讨论投篮技术和训练方法，不包含篮球鞋选购建议或装备推荐。",
    cited_slugs: [],
    confidence: "low",
    boundary: "knowledge_insufficient"
  }
];

function buildChatRecord(question, expectedJson, source) {
  const userContent = `问题：${question}\nRAG 知识卡：\n[]\n请只依据这些知识卡输出 JSON。`;
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
      { role: "assistant", content: JSON.stringify(expectedJson) }
    ],
    metadata: {
      source: source || "boundary_augmentation",
      cited_slugs: expectedJson.cited_slugs || []
    }
  };
}

async function main() {
  const outputDir = path.join(root, "data", "finetune", "shooting-vector-rag-teacher-v1");
  const boundaryDir = path.join(root, "data", "finetune", "boundary-augmentations");

  const records = [];
  for (const ex of REFUSAL_EXAMPLES) {
    records.push(buildChatRecord(ex.question, {
      answer: ex.answer,
      cited_slugs: ex.cited_slugs,
      confidence: ex.confidence,
      boundary: ex.boundary
    }, "boundary_refusal"));
  }
  for (const ex of INSUFFICIENT_EXAMPLES) {
    records.push(buildChatRecord(ex.question, {
      answer: ex.answer,
      cited_slugs: ex.cited_slugs,
      confidence: ex.confidence,
      boundary: ex.boundary
    }, "boundary_insufficient"));
  }

  // 也生成一份独立输出
  await mkdir(boundaryDir, { recursive: true });
  const boundaryPath = path.join(boundaryDir, "boundary_samples.jsonl");
  await writeFile(boundaryPath, records.map(r => JSON.stringify(r)).join("\n") + "\n");

  console.log(JSON.stringify({
    ok: true,
    boundary_samples: records.length,
    refusal: REFUSAL_EXAMPLES.length,
    insufficient: INSUFFICIENT_EXAMPLES.length,
    output: path.relative(root, boundaryPath)
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
