const state = await fetch("/api/arc-lab-platform").then((response) => response.json());
const supabaseProduction = await fetch("/api/arc-lab-supabase-production").then((response) => response.json());
const deploymentReadiness = await fetch("/api/arc-lab-deployment-readiness").then((response) => response.json());
const arcOptions = await fetch("/api/arc-lab/options").then((response) => response.json());
const identity = {
  coachId: "",
  athleteId: "",
  sessionId: "",
  videoAssetId: "",
  inviteToken: new URLSearchParams(window.location.search).get("invite") || ""
};

renderReviewQueue(state.coach_home.review_queue);
renderCoachNotifications(state.coach_home.notifications);
renderPublishGate(state.coach_session_review);
renderTrainingPlan(state.student_experience.feedback_result.training_plan_cards);
renderKnowledgeAssistant(state.student_experience.knowledge_assistant);
renderKnowledgeDirectory([]);
renderStudentTrend(state.student_experience.simplified_progress);
renderCoachTrend({ tracks: [] });
renderBoundaries(state.privacy_boundaries);
renderProductionBoundary(supabaseProduction, deploymentReadiness);
renderReviewEmpty("#coachReview", "上传课堂视频后，可在这里全片播放、切换动作阶段并对照最近三次记录。");
renderReviewEmpty("#studentReview", "教练发布课堂反馈后，这里会显示可回看的课堂视频和最近三次记录。");

const workbenchTitles = {
  coach: {
    home: "今日复盘工作台",
    review: "课堂视频复盘",
    students: "学生和邀请",
    trend: "训练趋势"
  },
  student: {
    home: "今日反馈",
    training: "本周训练",
    knowledge: "训练知识",
    progress: "我的进步"
  }
};

setupWorkbenchTabs();
setupIdentityFlow();
registerArcLabServiceWorker();

function setupWorkbenchTabs() {
  document.querySelectorAll(".app-tabbar button").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.closest(".app-tabbar")?.dataset.role || "coach";
      setWorkbenchTab(role, button.dataset.tab || "home");
    });
  });
  window.addEventListener("arc-lab-workbench-change", (event) => {
    setWorkbenchTab(event.detail?.role || "coach", event.detail?.tab || "home", false);
  });
  const role = document.body.dataset.role || (window.location.hash.startsWith("#student") ? "student" : "coach");
  const tab = document.body.dataset.tab || (window.location.hash === "#student" ? "knowledge" : "home");
  setWorkbenchTab(role, tab);
}

function setWorkbenchTab(role, tab, shouldScroll = true) {
  document.body.dataset.role = role;
  document.body.dataset.tab = tab;
  document.querySelectorAll(".app-tabbar button").forEach((button) => {
    const active = button.closest(".app-tabbar")?.dataset.role === role && button.dataset.tab === tab;
    button.toggleAttribute("aria-current", active);
  });
  const titleId = tab === "trend" || tab === "progress" ? "#trend-title" : role === "student" ? "#student-title" : "#coach-title";
  const title = document.querySelector(titleId);
  if (title) title.textContent = workbenchTitles[role]?.[tab] || title.textContent;
  const targetId = tab === "trend" || tab === "progress" ? "trend" : role;
  if (shouldScroll) document.querySelector(`#${targetId}`)?.scrollIntoView({ behavior: "auto", block: "start" });
  requestAnimationFrame(redrawVisibleReviewOverlays);
}

window.addEventListener("resize", redrawVisibleReviewOverlays);

function registerArcLabServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/arc-lab-sw.js").catch((error) => {
      console.warn("Arc Lab service worker registration failed", error);
    });
  });
}

function renderReviewQueue(items) {
  const target = document.querySelector("#reviewQueue");
  if (!items.length) {
    target.replaceChildren(card("queue-card", [strong("暂无待复盘视频"), meta("新的课堂视频或复测上传后会出现在这里。") ]));
    return;
  }
  target.replaceChildren(...items.map((item) => {
    const action = item.session_id ? reviewQueueAction(item) : null;
    return card("queue-card", [
      strong(item.athlete_name),
      meta(`${label(item.source_type)} · ${label(item.status)}`),
      chips((item.evidence_hints || []).map((hint) => typeof hint === "string" ? hint : hint.wording || hint.label || String(hint))),
      chips((item.sort_reasons || []).map(label)),
      chip(item.priority_student ? "priority" : "normal", item.priority_student ? "warn" : ""),
      action
    ]);
  }));
}

function reviewQueueAction(item) {
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = "打开复盘";
  action.addEventListener("click", () => openQueuedReview(item));
  return action;
}

function renderCoachNotifications(items = []) {
  const target = document.querySelector("#coachNotifications");
  if (!items.length) {
    target.replaceChildren(card("assistant-card", [strong("暂无新通知"), meta("复测上传、重点学生上传或需调整训练计划时会显示。") ]));
    return;
  }
  target.replaceChildren(...items.map((item) => card("assistant-card", [
    strong(item.athlete_name),
    meta(label(item.reason)),
    chip(item.level, item.level === "important" ? "warn" : "")
  ])));
}

function renderPublishGate(review) {
  const rows = [
    ["AI 草稿", review.ai_draft.student_visible ? "学生可见" : "学生不可见"],
    ["最终来源", label(review.published_feedback.source_of_truth)],
    ["主问题标签", label(review.coach_confirmation.primary_problem_tag_id)],
    ["计划步骤", review.published_feedback.final_plan.steps.map((step) => label(step.step_type)).join(" / ")]
  ];
  const target = document.querySelector("#publishGate");
  target.replaceChildren(...rows.flatMap(([key, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
}

function renderTrainingPlan(steps) {
  const target = document.querySelector("#trainingPlan");
  target.replaceChildren(...steps.map((step, index) => card("step-card", [
    strong(`${index + 1}. ${step.drill_name}`),
    meta(`${label(step.step_type)} · ${step.dosage}`),
    meta(step.short_reason),
    chip(step.success_target)
  ])));
}

function renderKnowledgeAssistant(assistant) {
  const target = document.querySelector("#knowledgeAssistant");
  const general = assistant.general_answer;
  const refusal = assistant.personal_diagnosis_refusal;
  target.replaceChildren(
    card("assistant-card", [
      strong("直接搜索训练问题"),
      meta("输入起球、发力、手肘、辅助手、弧线等训练问题，本地向量 RAG 会先检索知识卡，再由本地 LoRA 模型生成回答。"),
      chip("free_local_rag")
    ]),
    card("assistant-card", [
      strong("个人诊断边界"),
      meta(refusal.message),
      chip(label(refusal.answer_type), "warn")
    ])
  );
}

function renderStudentTrend(trend) {
  const target = document.querySelector("#studentTrend");
  if (!trend?.current_problem_tag_id || !trend.core_metric) {
    target.replaceChildren(card("trend-card", [strong("学生简化进步趋势"), meta("教练发布带有记录指标的课次或复测后显示。") ]));
    return;
  }
  const cards = [
    ["当前主标签", label(trend.current_problem_tag_id)],
    ["核心指标", `${label(trend.core_metric.label)}：${trend.core_metric.value}${trend.core_metric.unit}`],
    ["变化方向", label(trend.core_metric.direction)],
    ["教练说明", trend.interpretive_explanation?.status === "coach_confirmed" ? trend.interpretive_explanation.text : "等待教练确认"]
  ];
  target.replaceChildren(...cards.map(([key, value]) => card("trend-card", [
    strong(key),
    meta(value)
  ])));
}

function renderCoachTrend(trend) {
  const target = document.querySelector("#coachTrend");
  const tracks = trend?.tracks || [];
  if (!tracks.length) {
    target.replaceChildren(card("trend-card", [strong("教练趋势轨道"), meta("发布教练确认课次或学生上传带指标的复测后显示。") ]));
    return;
  }
  target.replaceChildren(...tracks.map((track) => card("trend-card", [
    strong(label(track.problem_tag_id)),
    meta(`${label(track.source_type)} · ${label(track.camera_view)} · ${label(track.shot_type)}`),
    meta(`最近 ${track.sessions.length} 次：${track.sessions.map((session) => session.metrics[0].value).join(" / ")}${track.sessions[0].metrics[0].unit}`),
    chip(label(track.core_metric_delta.direction || track.core_metric_delta.status))
  ])));
}

function renderBoundaries(boundaries) {
  const target = document.querySelector("#boundaries");
  target.replaceChildren(...Object.entries(boundaries).map(([key, value]) => {
    const li = document.createElement("li");
    li.textContent = `${label(key)}: ${Array.isArray(value) ? value.map(label).join(", ") : label(String(value))}`;
    return li;
  }));
}

function renderProductionBoundary(contract, readiness = {}) {
  const target = document.querySelector("#productionBoundary");
  target.replaceChildren(
    card("assistant-card", [
      strong(contract.validation?.ok ? "RLS / Storage 合同已通过" : "RLS / Storage 合同待修复"),
      meta(`RLS 表：${contract.rls_enabled_table_count}/${contract.core_table_count}`),
      chip(`Bucket: ${contract.storage_bucket}`)
    ]),
    card("assistant-card", [
      strong("独立审计删除"),
      meta((contract.audited_delete_actions || []).map(label).join(" / ")),
      meta(`未上线：${(contract.production_gaps || []).map(label).join(" / ")}`)
    ]),
    card("assistant-card", [
      strong("部署门禁"),
      meta(label(readiness.readiness_status)),
      meta(`缺失环境变量：${readiness.environment?.missing_required_variables?.length || 0}`),
      chips((readiness.environment?.required_groups || []).map((group) => `${label(group.id)} ${group.ready ? "ready" : "missing"}`)),
      meta(readiness.boundaries?.live_external_services_contacted ? "已连接外部服务" : "未连接外部服务")
    ])
  );
}

function setupIdentityFlow() {
  const coachForm = document.querySelector("#coachLoginForm");
  const athleteForm = document.querySelector("#athleteForm");
  const lessonForm = document.querySelector("#lessonUploadForm");
  const reviewForm = document.querySelector("#reviewPublishForm");
  const homeworkReviewForm = document.querySelector("#homeworkReviewForm");
  const trendExplanationForm = document.querySelector("#trendExplanationForm");
  const videoDeleteForm = document.querySelector("#videoDeleteForm");
  const sessionDeleteForm = document.querySelector("#sessionDeleteForm");
  const athleteDataDeleteForm = document.querySelector("#athleteDataDeleteForm");
  const studentForm = document.querySelector("#studentBindForm");
  const studentResultForm = document.querySelector("#studentResultForm");
  const studentHomeworkForm = document.querySelector("#studentHomeworkForm");
  const knowledgeAssistantForm = document.querySelector("#knowledgeAssistantForm");
  const priorityAthleteButton = document.querySelector("#priorityAthleteButton");
  const tokenInput = studentForm.elements.token;
  const resultTokenInput = studentResultForm.elements.token;
  const homeworkTokenInput = studentHomeworkForm.elements.token;
  populateLessonOptions(lessonForm);
  populateReviewOptions(reviewForm);
  populateHomeworkOptions(studentHomeworkForm);
  tokenInput.value = identity.inviteToken;
  resultTokenInput.value = identity.inviteToken;
  homeworkTokenInput.value = identity.inviteToken;
  if (identity.inviteToken) {
    renderInvitePreview(identity.inviteToken);
  }

  coachForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = new FormData(coachForm).get("phone");
    const result = await postJson("/api/arc-lab/coaches/login", { phone });
    if (!result.ok) return renderIdentityError("#identityStatus", result);
    identity.coachId = result.profile.id;
    renderCoachIdentity(result);
    refreshCoachHome();
  });

  athleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) {
      renderIdentityError("#identityStatus", { message: "请先登录教练手机号。" });
      return;
    }
    const displayName = new FormData(athleteForm).get("display_name");
    const result = await postJson("/api/arc-lab/athletes", {
      coach_id: identity.coachId,
      display_name: displayName
    });
    if (!result.ok) return renderIdentityError("#identityStatus", result);
    identity.inviteToken = result.invite.token;
    identity.athleteId = result.athlete.id;
    tokenInput.value = identity.inviteToken;
    resultTokenInput.value = identity.inviteToken;
    homeworkTokenInput.value = identity.inviteToken;
    lessonForm.elements.athlete_id.value = identity.athleteId;
    trendExplanationForm.elements.athlete_id.value = identity.athleteId;
    athleteDataDeleteForm.elements.athlete_id.value = identity.athleteId;
    renderAthleteInvite(result);
    priorityAthleteButton.disabled = false;
    priorityAthleteButton.dataset.active = "false";
    priorityAthleteButton.textContent = "设为优先学生";
    refreshCoachHome();
  });

  lessonForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) {
      renderIdentityError("#lessonUploadStatus", { message: "请先登录教练手机号。" });
      return;
    }
    const form = new FormData(lessonForm);
    let upload;
    try {
      upload = await uploadVideoFile(lessonForm.elements.video_file.files[0]);
    } catch (error) {
      return renderIdentityError("#lessonUploadStatus", { message: error.message });
    }
    const result = await postJson("/api/arc-lab/coach-lessons", {
      coach_id: identity.coachId,
      athlete_id: form.get("athlete_id"),
      initial_problem_tag_id: form.get("initial_problem_tag_id"),
      camera_view: form.get("camera_view"),
      shot_type: form.get("shot_type"),
      trend_metric_value: form.get("trend_metric_value"),
      file_name: upload?.file_name || form.get("file_name"),
      upload_id: upload?.upload_id || null
    });
    if (!result.ok) return renderIdentityError("#lessonUploadStatus", result);
    identity.sessionId = result.session.id;
    identity.videoAssetId = result.video_asset.id;
    reviewForm.elements.session_id.value = result.session.id;
    reviewForm.elements.primary_problem_tag_id.value = result.session.initial_problem_tag_id;
    videoDeleteForm.elements.video_asset_id.value = result.video_asset.id;
    sessionDeleteForm.elements.session_id.value = result.session.id;
    renderLessonUpload(result);
    renderCoachReview(result.session.id);
    refreshCoachHome();
  });

  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) {
      renderIdentityError("#reviewPublishStatus", { message: "请先登录教练手机号。" });
      return;
    }
    const form = new FormData(reviewForm);
    const secondary = Array.from(reviewForm.elements.secondary_problem_tag_ids.selectedOptions).map((option) => option.value);
    const result = await postJson("/api/arc-lab/coach-reviews/publish", {
      coach_id: identity.coachId,
      session_id: form.get("session_id"),
      primary_problem_tag_id: form.get("primary_problem_tag_id"),
      secondary_problem_tag_ids: secondary,
      coach_feedback_text: form.get("coach_feedback_text"),
      coach_note: form.get("coach_feedback_text")
    });
    if (!result.ok) return renderIdentityError("#reviewPublishStatus", result);
    renderReviewPublish(result);
    refreshCoachTrend();
    refreshCoachHome();
  });

  homeworkReviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) {
      renderIdentityError("#homeworkReviewStatus", { message: "请先登录教练手机号。" });
      return;
    }
    const form = new FormData(homeworkReviewForm);
    const result = await postJson("/api/arc-lab/coach-homework/review", {
      coach_id: identity.coachId,
      session_id: form.get("session_id"),
      coach_note: form.get("coach_note"),
      step_effectiveness: [
        { step_type: "correction", effectiveness_status: form.get("correction_status") },
        { step_type: "transfer", effectiveness_status: form.get("transfer_status") }
      ]
    });
    if (!result.ok) return renderIdentityError("#homeworkReviewStatus", result);
    renderHomeworkReview(result);
    refreshCoachTrend();
    refreshCoachHome();
  });

  studentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(studentForm);
    const token = String(form.get("token") || "").trim();
    const phone = form.get("phone");
    const result = await postJson(`/api/arc-lab/invites/${encodeURIComponent(token)}/bind-phone`, { phone });
    if (!result.ok) return renderIdentityError("#studentBindStatus", result);
    renderStudentBinding(result);
    resultTokenInput.value = token;
    homeworkTokenInput.value = token;
    renderStudentResults(token);
    renderStudentTrends(token);
  });

  studentResultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = String(new FormData(studentResultForm).get("token") || "").trim();
    renderStudentResults(token);
  });

  studentHomeworkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(studentHomeworkForm);
    let upload;
    try {
      upload = await uploadVideoFile(studentHomeworkForm.elements.video_file.files[0]);
    } catch (error) {
      return renderIdentityError("#studentHomeworkStatus", { message: error.message });
    }
    const result = await postJson("/api/arc-lab/student-homework", {
      token: form.get("token"),
      training_task_id: form.get("training_task_id"),
      camera_view: form.get("camera_view"),
      shot_type: form.get("shot_type"),
      trend_metric_value: form.get("trend_metric_value"),
      file_name: upload?.file_name || form.get("file_name"),
      upload_id: upload?.upload_id || null,
      self_reported_complete: form.get("self_reported_complete") === "on"
    });
    if (!result.ok) return renderIdentityError("#studentHomeworkStatus", result);
    homeworkReviewForm.elements.session_id.value = result.session.id;
    renderStudentHomework(result);
    refreshCoachTrend();
    renderStudentTrends(String(form.get("token") || "").trim());
    refreshCoachHome();
  });

  knowledgeAssistantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(knowledgeAssistantForm);
    const button = knowledgeAssistantForm.querySelector("button[type='submit']");
    button.disabled = true;
    document.querySelector("#knowledgeAssistantStatus").replaceChildren(statusLine("loading", "本地模型正在检索和生成回答。"));
    try {
      const result = await postJson("/api/local-rag-coach", {
        question: form.get("question")
      });
      renderKnowledgeAssistantAnswer(result);
    } catch (error) {
      renderIdentityError("#knowledgeAssistantStatus", { message: error.message || "本地模型调用失败。" });
    } finally {
      button.disabled = false;
    }
  });

  trendExplanationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) {
      renderIdentityError("#trendExplanationStatus", { message: "请先登录教练手机号。" });
      return;
    }
    const form = new FormData(trendExplanationForm);
    const result = await postJson("/api/arc-lab/coach-trends/explanation", {
      coach_id: identity.coachId,
      athlete_id: form.get("athlete_id"),
      trend_key: form.get("trend_key"),
      text: form.get("text")
    });
    if (!result.ok) return renderIdentityError("#trendExplanationStatus", result);
    const target = document.querySelector("#trendExplanationStatus");
    target.replaceChildren(statusLine("ok", "趋势说明已由教练确认，学生端可见。"), identityTable([
      ["趋势轨道", result.trend_explanation.trend_key],
      ["学生可见", result.trend_explanation.student_visible ? "是" : "否"]
    ]));
    renderCoachTrend(result.trend.coach_view);
    renderStudentTrends(identity.inviteToken);
  });

  videoDeleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) return renderIdentityError("#auditedDeleteStatus", { message: "请先登录教练手机号。" });
    const result = await postJson("/api/arc-lab/videos/delete", {
      coach_id: identity.coachId,
      video_asset_id: new FormData(videoDeleteForm).get("video_asset_id")
    });
    renderAuditedDelete(result);
    if (result.ok) renderCoachReview(identity.sessionId);
  });

  sessionDeleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) return renderIdentityError("#auditedDeleteStatus", { message: "请先登录教练手机号。" });
    const result = await postJson("/api/arc-lab/sessions/delete", {
      coach_id: identity.coachId,
      session_id: new FormData(sessionDeleteForm).get("session_id")
    });
    renderAuditedDelete(result);
    if (result.ok) {
      renderReviewEmpty("#coachReview", "该 Session 已删除并写入审计事件。");
      refreshCoachHome();
      refreshCoachTrend();
    }
  });

  athleteDataDeleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identity.coachId) return renderIdentityError("#auditedDeleteStatus", { message: "请先登录教练手机号。" });
    const result = await postJson("/api/arc-lab/athlete-data/delete", {
      coach_id: identity.coachId,
      athlete_id: new FormData(athleteDataDeleteForm).get("athlete_id")
    });
    renderAuditedDelete(result);
    if (result.ok) {
      renderReviewEmpty("#coachReview", "该学生数据已删除并写入审计事件。");
      renderCoachTrend({ tracks: [] });
      refreshCoachHome();
    }
  });

  priorityAthleteButton.addEventListener("click", async () => {
    if (!identity.coachId || !identity.athleteId) return;
    const active = priorityAthleteButton.dataset.active !== "true";
    const result = await postJson("/api/arc-lab/coach-athlete-flags/priority", {
      coach_id: identity.coachId,
      athlete_id: identity.athleteId,
      active
    });
    if (!result.ok) return renderIdentityError("#identityStatus", result);
    priorityAthleteButton.dataset.active = String(result.priority_student);
    priorityAthleteButton.textContent = result.priority_student ? "取消优先学生" : "设为优先学生";
    refreshCoachHome();
  });
}

function renderKnowledgeAssistantAnswer(result) {
  if (!result.ok || !result.answer) return renderIdentityError("#knowledgeAssistantStatus", result);
  const answer = result.answer;
  const matches = result.retrieval?.matches || [];
  const citedSlugs = new Set(answer.cited_slugs || []);
  document.querySelector("#knowledgeAssistantStatus").replaceChildren(
    statusLine("ok", `${label(result.model_source || "local_rag")} · ${matches.length} 条引用`),
    identityTable([
      ["边界", label(answer.boundary)],
      ["置信度", label(answer.confidence)],
      ["保存问题", "否"],
      ["聊天历史", "未写入"]
    ])
  );
  document.querySelector("#knowledgeAssistant").replaceChildren(
    card("assistant-card answer-card", [
      strong("回答"),
      meta(answer.answer),
      chips((answer.cited_slugs || []).map((slug) => `引用 ${slug}`))
    ])
  );
  renderKnowledgeDirectory(matches, citedSlugs);
}

async function renderStudentKnowledgeDirectory(token) {
  if (!token) return renderIdentityError("#knowledgeDirectoryStatus", { message: "请先输入邀请 Token。" });
  const result = await fetch(`/api/arc-lab/student-knowledge-directory?token=${encodeURIComponent(token)}`).then((response) => response.json());
  if (!result.ok) return renderIdentityError("#knowledgeDirectoryStatus", result);
  document.querySelector("#knowledgeDirectoryStatus").replaceChildren(statusLine("ok", `已加载 ${result.directory.articles.length} 条训练知识。`));
  renderKnowledgeDirectory(result.directory.articles);
}

function renderKnowledgeDirectory(articles, citedSlugs = new Set()) {
  const target = document.querySelector("#knowledgeDirectory");
  if (!articles.length) {
    target.replaceChildren(card("assistant-card", [strong("等待搜索"), meta("提交问题后，这里会显示本地向量 RAG 命中的知识卡。") ]));
    return;
  }
  target.replaceChildren(...articles.map((article) => card("assistant-card", [
    strong(article.title),
    meta(article.summary || "暂无摘要"),
    article.score ? chip(`score ${Number(article.score).toFixed(3)}`) : null,
    article.slug ? chip(article.slug, citedSlugs.has(article.slug) ? "warn" : "") : null,
    article.default_dosage ? chip(article.default_dosage) : null,
    article.required_view ? chip(label(article.required_view)) : null,
    ...(article.tags || []).map((tag) => chip(tag))
  ])));
}

function populateLessonOptions(form) {
  fillSelect(form.elements.initial_problem_tag_id, arcOptions.problem_tags, "label_zh");
  fillSelect(form.elements.camera_view, arcOptions.camera_views, "label");
  fillSelect(form.elements.shot_type, arcOptions.shot_types, "label");
  form.elements.initial_problem_tag_id.value = "hand_leads_before_lower_body";
  form.elements.camera_view.value = "side";
  form.elements.shot_type.value = "spot_up";
}

function populateReviewOptions(form) {
  fillSelect(form.elements.primary_problem_tag_id, arcOptions.problem_tags, "label_zh");
  fillSelect(form.elements.secondary_problem_tag_ids, arcOptions.problem_tags, "label_zh");
  form.elements.primary_problem_tag_id.value = "hand_leads_before_lower_body";
  for (const option of form.elements.secondary_problem_tag_ids.options) {
    option.selected = ["lower_body_ball_transfer_disconnect", "low_release_point"].includes(option.value);
  }
}

function populateHomeworkOptions(form) {
  fillSelect(form.elements.camera_view, arcOptions.camera_views, "label");
  fillSelect(form.elements.shot_type, arcOptions.shot_types, "label");
  form.elements.camera_view.value = "side";
  form.elements.shot_type.value = "spot_up";
}

function fillSelect(select, items, labelKey) {
  select.replaceChildren(...items.map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey] || label(item.id);
    return option;
  }));
}

async function renderInvitePreview(token) {
  const result = await fetch(`/api/arc-lab/invites/${encodeURIComponent(token)}`).then((response) => response.json());
  if (!result.ok) return renderIdentityError("#studentBindStatus", result);
  const target = document.querySelector("#studentBindStatus");
  target.replaceChildren(
    statusLine("ok", "邀请已读取"),
    identityTable([
      ["机构", result.organization?.name || "-"],
      ["学生", result.athlete?.display_name || "-"],
      ["状态", label(result.status)]
    ])
  );
}

function renderCoachIdentity(result) {
  const target = document.querySelector("#identityStatus");
  target.replaceChildren(
    statusLine("ok", "教练已登录，本地默认机构已就绪。"),
    identityTable([
      ["教练", result.profile.phone],
      ["机构", result.organization.name],
      ["Auth", result.auth_mode]
    ])
  );
}

function renderAthleteInvite(result) {
  const target = document.querySelector("#identityStatus");
  const inviteUrl = new URL(result.invite_link, window.location.origin);
  target.replaceChildren(
    statusLine("ok", "学生已创建，邀请链接已生成。"),
    identityTable([
      ["学生", result.athlete.display_name],
      ["Token", result.invite.token],
      ["有效期", result.invite.expires_at]
    ]),
    link("打开学生邀请入口", inviteUrl.pathname + inviteUrl.search)
  );
}

function renderStudentBinding(result) {
  const target = document.querySelector("#studentBindStatus");
  target.replaceChildren(
    statusLine("ok", "手机号已绑定，学生端只显示教练发布结果。"),
    identityTable([
      ["学生", result.athlete.display_name],
      ["手机号", result.profile.phone],
      ["隐藏", result.student_home.hidden_from_student.map(label).join(" / ")]
    ])
  );
}

async function renderStudentResults(token) {
  const result = await fetch(`/api/arc-lab/student-results?token=${encodeURIComponent(token)}`).then((response) => response.json());
  if (!result.ok) return renderIdentityError("#studentResultStatus", result);
  const target = document.querySelector("#studentResultStatus");
  const latest = result.results[0];
  if (!latest) {
    target.replaceChildren(statusLine("ok", "还没有已发布的教练反馈。"));
    renderReviewEmpty("#studentReview", "教练发布课堂反馈后，这里会显示可回看的课堂视频和最近三次记录。");
    return;
  }
  const plan = latest.training_plan_steps || [];
  const homeworkForm = document.querySelector("#studentHomeworkForm");
  homeworkForm.elements.training_task_id.value = latest.training_task.id;
  homeworkForm.elements.token.value = token;
  target.replaceChildren(
    statusLine("ok", "已读取教练发布的最终反馈。"),
    identityTable([
      ["最终来源", label(result.student_final_source_of_truth)],
      ["课程", label(latest.session.source_type)],
      ["状态", label(latest.session.status)],
      ["教练总结", latest.coach_feedback.final_feedback_json.coach_summary],
      ["主问题", label(latest.coach_feedback.final_feedback_json.training_plan.primary_problem_tag_id)],
      ["训练步骤", plan.map((step) => label(step.step_type)).join(" / ")],
      ["任务状态", label(latest.training_task.status)],
      ["隐藏", result.hidden_from_student.map(label).join(" / ")]
    ])
  );
  renderStudentReview(token, latest.session.id);
  renderStudentTrends(token);
}

async function refreshCoachHome() {
  if (!identity.coachId) return;
  const result = await fetch(`/api/arc-lab/coach-home?coach_id=${encodeURIComponent(identity.coachId)}`).then((response) => response.json());
  if (!result.ok) return renderIdentityError("#identityStatus", result);
  renderReviewQueue(result.review_queue);
  renderCoachNotifications(result.notifications);
  const current = result.athletes.find((athlete) => athlete.id === identity.athleteId);
  if (current) {
    const button = document.querySelector("#priorityAthleteButton");
    button.disabled = false;
    button.dataset.active = String(current.priority_student);
    button.textContent = current.priority_student ? "取消优先学生" : "设为优先学生";
  }
}

function openQueuedReview(item) {
  identity.athleteId = item.athlete_id;
  identity.sessionId = item.session_id;
  document.querySelector("#lessonUploadForm").elements.athlete_id.value = item.athlete_id;
  document.querySelector("#trendExplanationForm").elements.athlete_id.value = item.athlete_id;
  document.querySelector("#athleteDataDeleteForm").elements.athlete_id.value = item.athlete_id;
  document.querySelector("#sessionDeleteForm").elements.session_id.value = item.session_id;
  if (item.source_type === "athlete_homework") {
    document.querySelector("#homeworkReviewForm").elements.session_id.value = item.session_id;
  } else {
    document.querySelector("#reviewPublishForm").elements.session_id.value = item.session_id;
  }
  setWorkbenchTab("coach", "review");
  renderCoachReview(item.session_id);
  refreshCoachHome();
}

function renderAuditedDelete(result) {
  if (!result.ok) return renderIdentityError("#auditedDeleteStatus", result);
  const rows = [
    ["动作", label(result.action)],
    ["物理文件", result.deleted_physical_uploads === true || result.deleted_physical_upload === true ? "已删除" : "未声明删除"],
    ["下一步", label(result.next_step || result.source_contract)]
  ];
  if (result.affected) rows.push(["影响记录", Object.entries(result.affected).map(([key, value]) => `${label(key)} ${value}`).join(" / ")]);
  const target = document.querySelector("#auditedDeleteStatus");
  target.replaceChildren(
    statusLine("ok", "删除动作已写入独立审计事件。"),
    identityTable(rows)
  );
}

async function renderCoachReview(sessionId = "") {
  if (!identity.coachId || !identity.athleteId) return;
  const query = new URLSearchParams({ coach_id: identity.coachId, athlete_id: identity.athleteId });
  if (sessionId) query.set("session_id", sessionId);
  const result = await fetch(`/api/arc-lab/coach-review?${query}`).then((response) => response.json());
  if (!result.ok) return renderReviewEmpty("#coachReview", result.message || "课堂复盘暂不可用。");
  renderReviewExperience("#coachReview", result, (nextSessionId) => renderCoachReview(nextSessionId));
}

async function renderStudentReview(token, sessionId = "") {
  if (!token) return;
  const query = new URLSearchParams({ token });
  if (sessionId) query.set("session_id", sessionId);
  const result = await fetch(`/api/arc-lab/student-review?${query}`).then((response) => response.json());
  if (!result.ok) return renderReviewEmpty("#studentReview", result.message || "已发布课堂视频暂不可用。");
  renderReviewExperience("#studentReview", result, (nextSessionId) => renderStudentReview(token, nextSessionId));
}

function renderReviewEmpty(selector, message) {
  const target = document.querySelector(selector);
  const module = document.createElement("div");
  module.className = "review-upload-module";
  const videoPanel = document.createElement("div");
  videoPanel.className = "video-panel replay-panel";
  videoPanel.append(reviewSectionTitle("视频复盘", "浏览器本地播放"));
  const frame = document.createElement("div");
  frame.className = "video-stage review-video-frame";
  const empty = document.createElement("div");
  empty.className = "empty-video review-empty";
  empty.append(strong("等待课堂视频"), meta(message));
  frame.append(empty, reviewPoseStatus("等待上传视频；不会显示静态假骨架。"));
  videoPanel.append(frame, reviewTransport(null), reviewFrameStatus("本地播放只用于教练复核；不上传云端，不导出视频。"));
  module.append(videoPanel);
  target.replaceChildren(module);
}

function renderReviewExperience(selector, review, onSessionSelect) {
  const target = document.querySelector(selector);
  const activeStageId = target.dataset.activeStage || review.stages[0]?.id;
  const activeStage = review.stages.find((stage) => stage.id === activeStageId) || review.stages[0];
  const module = document.createElement("div");
  module.className = "review-upload-module";
  const videoPanel = document.createElement("div");
  videoPanel.className = "video-panel replay-panel";
  videoPanel.append(reviewSectionTitle("视频复盘", "浏览器本地播放"));
  const frame = document.createElement("div");
  frame.className = "video-stage review-video-frame";
  let canvas = null;
  let video = null;
  if (review.player.playback_available) {
    video = document.createElement("video");
    video.className = "loaded";
    video.controls = true;
    video.muted = true;
    video.preload = "metadata";
    video.src = review.player.playback_url;
    video.setAttribute("playsinline", "");
    frame.append(video);
    canvas = document.createElement("canvas");
    canvas.className = "pose-canvas review-overlay-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.__reviewOverlay = { review, activeStage };
    frame.append(canvas);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-video review-empty";
    empty.append(strong("等待本地视频"), meta("本次会话只记录了文件名，尚未附加本地视频文件。"));
    frame.append(empty);
  }
  const overlay = document.createElement("p");
  overlay.className = "pose-status review-overlay";
  overlay.textContent = `${activeStage.label} · 教练复核标注 · ${review.annotations.items.map((item) => item.label).join(" / ")}`;
  frame.append(overlay);
  if (canvas) requestAnimationFrame(() => drawReviewOverlay(canvas, review, activeStage));
  videoPanel.append(
    frame,
    reviewTransport(video),
    reviewFrameStatus("本地 PNG 导出只保存当前视频帧和当前 overlay；不导出视频，不上传云端。"),
    reviewStageKeyframes(review, activeStage, selector, target, onSessionSelect)
  );

  const evidencePanel = document.createElement("aside");
  evidencePanel.className = "evidence-panel review-evidence-panel";
  const caption = card("diagnosis-card review-session-card", [
    strong("当前会话"),
    meta(`${label(review.current_session.source_type)} · ${label(review.current_session.camera_view)} · ${label(review.current_session.shot_type)}`),
    meta(review.annotations.items.map((item) => item.scope).join(" / "))
  ]);
  const comparison = document.createElement("ol");
  comparison.className = "review-comparison";
  for (const session of review.comparison.sessions) {
    const item = document.createElement("li");
    item.append(
      strong(session.id === review.current_session.id ? "当前会话" : label(session.source_type)),
      meta(session.core_metric ? `${session.core_metric.label}：${session.core_metric.value}${session.core_metric.unit}` : "暂无可比较核心指标")
    );
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = session.id === review.current_session.id ? "当前查看" : "查看该次";
    button.disabled = session.id === review.current_session.id;
    button.addEventListener("click", () => onSessionSelect(session.id));
    item.append(button);
    comparison.append(item);
  }
  evidencePanel.append(caption, reviewSectionTitle("最近记录", "current + 2"), comparison);
  module.append(videoPanel, evidencePanel);
  target.replaceChildren(module);
  wireReviewTransport(videoPanel, video);
}

function reviewSectionTitle(title, detail) {
  const element = document.createElement("div");
  element.className = "section-title";
  element.append(strong(title), meta(detail));
  return element;
}

function reviewPoseStatus(text) {
  const status = document.createElement("div");
  status.className = "pose-status";
  status.textContent = text;
  return status;
}

function reviewFrameStatus(text) {
  const status = document.createElement("div");
  status.className = "frame-export-status";
  status.textContent = text;
  return status;
}

function reviewTransport(video) {
  const transport = document.createElement("div");
  transport.className = "transport review-transport";
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.textContent = "播放/暂停";
  playButton.disabled = !video;
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "导出标注帧";
  exportButton.disabled = !video;
  const progress = document.createElement("div");
  progress.className = "progress";
  progress.append(document.createElement("span"));
  const time = document.createElement("span");
  time.className = "time-readout";
  time.textContent = "00:00.00 / 00:00.00";
  transport.append(playButton, exportButton, progress, time);
  return transport;
}

function wireReviewTransport(container, video) {
  if (!video) return;
  const button = container.querySelector(".review-transport button");
  const exportButton = container.querySelectorAll(".review-transport button")[1];
  const progress = container.querySelector(".progress span");
  const time = container.querySelector(".time-readout");
  const status = container.querySelector(".frame-export-status");
  const update = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    progress.style.width = duration ? `${Math.min(100, Math.max(0, current / duration * 100))}%` : "0%";
    time.textContent = `${formatReviewTime(current)} / ${formatReviewTime(duration)}`;
  };
  button.addEventListener("click", () => {
    if (video.paused) video.play().catch(() => null);
    else video.pause();
  });
  exportButton.addEventListener("click", () => exportReviewFrame(container, video, status));
  video.addEventListener("loadedmetadata", update);
  video.addEventListener("timeupdate", update);
  update();
}

function exportReviewFrame(container, video, status) {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || Math.round(width * 9 / 16);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#020405";
  context.fillRect(0, 0, width, height);
  try {
    context.drawImage(video, 0, 0, width, height);
    const overlay = container.querySelector(".review-overlay-canvas");
    if (overlay?.width && overlay?.height) context.drawImage(overlay, 0, 0, width, height);
    const link = document.createElement("a");
    link.download = `arc-lab-review-frame-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    if (status) status.textContent = `已导出当前标注帧 PNG：${width}x${height}；只保存在本机浏览器下载。`;
  } catch {
    if (status) status.textContent = "当前浏览器暂不能导出该视频帧；请继续使用本地复盘播放。";
  }
}

function formatReviewTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = (value % 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${rest}`;
}

function reviewStageKeyframes(review, activeStage, selector, target, onSessionSelect) {
  const stages = document.createElement("div");
  stages.className = "stage-list keyframes review-keyframes";
  for (const stage of review.stages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `keyframe${stage.id === activeStage.id ? " selected" : ""}`;
    button.setAttribute("aria-pressed", String(stage.id === activeStage.id));
    button.append(document.createElement("span"), strong(stage.label), meta(stage.order ? `Phase ${stage.order}` : "Phase"));
    button.addEventListener("click", () => {
      target.dataset.activeStage = stage.id;
      renderReviewExperience(selector, review, onSessionSelect);
    });
    stages.append(button);
  }
  return stages;
}

function redrawVisibleReviewOverlays() {
  document.querySelectorAll(".review-overlay-canvas").forEach((canvas) => {
    const details = canvas.__reviewOverlay;
    if (details) drawReviewOverlay(canvas, details.review, details.activeStage);
  });
}

function drawReviewOverlay(canvas, review, activeStage) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  const points = reviewPosePoints(bounds.width, bounds.height, activeStage?.id);
  drawReviewCoachLines(context, points);
  drawReviewPhaseMarkers(context, bounds, review.stages || [], activeStage);
}

function reviewPosePoints(width, height, stageId) {
  const lift = stageId === "ball_lift" ? -0.04 : 0;
  const lower = stageId === "lower_body_start" ? 0.04 : 0;
  const release = stageId === "release" ? -0.07 : 0;
  const follow = stageId === "follow_through" ? 0.05 : 0;
  const point = (left, top) => ({ left: left * width, top: top * height });
  return {
    rightAnkle: point(0.42, 0.88),
    rightKnee: point(0.44 + lower, 0.69),
    rightHip: point(0.51, 0.53),
    rightShoulder: point(0.58, 0.36 + lift),
    rightElbow: point(0.66 + follow, 0.29 + release),
    rightWrist: point(0.74 + follow, 0.22 + release),
    leftShoulder: point(0.49, 0.38 + lift),
    leftElbow: point(0.56, 0.34 + release),
    leftWrist: point(0.63, 0.29 + release),
    leftHip: point(0.45, 0.54),
    leftKnee: point(0.38 + lower, 0.71),
    leftAnkle: point(0.35, 0.9)
  };
}

function drawReviewCoachLines(context, points) {
  const hipMidpoint = reviewMidpoint(points.leftHip, points.rightHip);
  const shoulderMidpoint = reviewMidpoint(points.leftShoulder, points.rightShoulder);
  const lines = [
    { label: "脚膝髋力线", color: "#22d3ee", points: [points.rightAnkle, points.rightKnee, points.rightHip] },
    { label: "肩肘腕线", color: "#facc15", points: [points.rightShoulder, points.rightElbow, points.rightWrist] },
    { label: "辅助手线", color: "#a78bfa", points: [points.leftShoulder, points.leftElbow, points.leftWrist] },
    { label: "发力链线", color: "#fb7185", points: [points.rightAnkle, points.rightKnee, points.rightHip, points.rightShoulder, points.rightElbow, points.rightWrist] },
    { label: "躯干线", color: "#ffffff", points: [hipMidpoint, shoulderMidpoint] }
  ];
  for (const line of lines) {
    drawReviewPolyline(context, line.points, line.color);
    drawReviewLabel(context, line.label, line.points.at(-1), line.color);
  }
  drawReviewAngle(context, points.rightAnkle, points.rightKnee, points.rightHip, "膝角", "#38bdf8");
  drawReviewAngle(context, points.rightKnee, points.rightHip, points.rightShoulder, "髋角", "#34d399");
  drawReviewAngle(context, points.rightShoulder, points.rightElbow, points.rightWrist, "肘角", "#fbbf24");
  drawReviewAngle(context, shoulderMidpoint, hipMidpoint, { left: hipMidpoint.left, top: hipMidpoint.top - 72 }, "躯干角", "#f472b6");
}

function drawReviewPhaseMarkers(context, bounds, stages, activeStage) {
  const markerMap = {
    ball_lift: { left: 0.61, top: 0.36 },
    lower_body_start: { left: 0.42, top: 0.7 },
    release: { left: 0.74, top: 0.22 },
    follow_through: { left: 0.79, top: 0.18 }
  };
  for (const stage of stages) {
    const marker = markerMap[stage.id];
    if (!marker) continue;
    const point = { left: marker.left * bounds.width, top: marker.top * bounds.height };
    const active = stage.id === activeStage?.id;
    context.save();
    context.fillStyle = active ? "rgba(246, 71, 71, 0.94)" : "rgba(4, 13, 18, 0.78)";
    context.strokeStyle = active ? "#fff8ef" : "rgba(255, 248, 239, 0.62)";
    context.lineWidth = active ? 3 : 1.5;
    context.beginPath();
    context.arc(point.left, point.top, active ? 10 : 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    drawReviewLabel(context, stage.label, { left: point.left + 10, top: point.top - 8 }, active ? "#fff8ef" : "#d8e6df");
    context.restore();
  }
}

function drawReviewPolyline(context, points, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0, 0, 0, 0.65)";
  context.shadowBlur = 6;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.left, point.top);
    else context.lineTo(point.left, point.top);
  });
  context.stroke();
  context.restore();
}

function drawReviewLabel(context, text, point, color) {
  if (!point) return;
  context.save();
  context.font = "12px system-ui, sans-serif";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(0, 0, 0, 0.78)";
  context.fillStyle = color;
  context.strokeText(text, point.left + 6, point.top - 6);
  context.fillText(text, point.left + 6, point.top - 6);
  context.restore();
}

function drawReviewAngle(context, startPoint, vertexPoint, endPoint, labelText, color) {
  const startAngle = Math.atan2(startPoint.top - vertexPoint.top, startPoint.left - vertexPoint.left);
  const endAngle = Math.atan2(endPoint.top - vertexPoint.top, endPoint.left - vertexPoint.left);
  const sweep = normalizeReviewRadians(endAngle - startAngle);
  const degrees = Math.round(Math.abs(sweep) * 180 / Math.PI);
  const radius = 28;
  const labelAngle = startAngle + sweep / 2;
  const labelPoint = {
    left: vertexPoint.left + Math.cos(labelAngle) * (radius + 14),
    top: vertexPoint.top + Math.sin(labelAngle) * (radius + 14)
  };
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 3;
  context.lineCap = "round";
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 5;
  context.beginPath();
  context.arc(vertexPoint.left, vertexPoint.top, radius, startAngle, startAngle + sweep, sweep < 0);
  context.stroke();
  drawReviewLabel(context, `${labelText} ${degrees}°`, labelPoint, color);
  context.restore();
}

function reviewMidpoint(firstPoint, secondPoint) {
  return {
    left: (firstPoint.left + secondPoint.left) / 2,
    top: (firstPoint.top + secondPoint.top) / 2
  };
}

function normalizeReviewRadians(value) {
  let radians = value;
  while (radians > Math.PI) radians -= Math.PI * 2;
  while (radians < -Math.PI) radians += Math.PI * 2;
  return radians;
}

async function refreshCoachTrend() {
  if (!identity.coachId || !identity.athleteId) return;
  const result = await fetch(`/api/arc-lab/coach-trends?coach_id=${encodeURIComponent(identity.coachId)}&athlete_id=${encodeURIComponent(identity.athleteId)}`).then((response) => response.json());
  if (!result.ok) return renderIdentityError("#trendExplanationStatus", result);
  renderCoachTrend(result.trend.coach_view);
  document.querySelector("#trendExplanationForm").elements.trend_key.value = result.trend.student_view.current_track_key || "";
}

async function renderStudentTrends(token) {
  if (!token) return;
  const result = await fetch(`/api/arc-lab/student-trends?token=${encodeURIComponent(token)}`).then((response) => response.json());
  if (!result.ok) return;
  renderStudentTrend(result.trend);
}

function renderStudentHomework(result) {
  const target = document.querySelector("#studentHomeworkStatus");
  target.replaceChildren(
    statusLine("ok", result.view_policy.counts_as_requested_homework_completion ? "复测视频已上传，等待教练复盘。" : "错误视角已保存为补充记录，请按要求视角重新上传。"),
    identityTable([
      ["Session", result.session.id],
      ["任务状态", label(result.training_task.status)],
      ["实际视角", label(result.session.camera_view)],
      ["完成要求", result.view_policy.counts_as_requested_homework_completion ? "是" : "否"],
      ["趋势轨道", result.evidence_packet.packet_json.trend_key_preview],
      ["下一步", label(result.next_step)]
    ])
  );
}

function renderHomeworkReview(result) {
  const target = document.querySelector("#homeworkReviewStatus");
  target.replaceChildren(
    statusLine("ok", result.counts_as_requested_homework_completion ? "作业复盘已完成，效果状态已写入任务。" : "补充视角已复盘，但原任务仍需按要求视角完成。"),
    identityTable([
      ["任务状态", label(result.training_task.status)],
      ["训练效果", result.training_plan_step_results.map((item) => `${label(item.step_type)}: ${label(item.effectiveness_status)}`).join(" / ")],
      ["下一步", label(result.next_step)]
    ])
  );
}

function renderLessonUpload(result) {
  const target = document.querySelector("#lessonUploadStatus");
  target.replaceChildren(
    statusLine("ok", "线下课视频已进入教练复盘队列。"),
    identityTable([
      ["Session", result.session.id],
      ["分轨", result.evidence_packet.packet_json.trend_key_preview],
      ["AI 草稿", result.student_visible_ai_draft ? "学生可见" : "仅教练可见"],
      ["下一步", label(result.next_step)]
    ])
  );
}

function renderReviewPublish(result) {
  const target = document.querySelector("#reviewPublishStatus");
  target.replaceChildren(
    statusLine("ok", "教练反馈已发布，学生端只会看到最终结果。"),
    identityTable([
      ["最终来源", label(result.published_feedback.source_of_truth)],
      ["主问题", label(result.published_feedback.final_plan.primary_problem_tag_id)],
      ["计划步骤", String(result.training_plan_steps.length)],
      ["隐藏", result.published_feedback.hidden_from_student.map(label).join(" / ")]
    ])
  );
}

function renderIdentityError(selector, result) {
  const target = document.querySelector(selector);
  target.replaceChildren(statusLine("error", result.message || "操作失败"));
}

function identityTable(rows) {
  const dl = document.createElement("dl");
  dl.className = "identity-table";
  for (const [key, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

function statusLine(className, text) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function link(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

async function uploadVideoFile(file) {
  if (!file) return null;
  const form = new FormData();
  form.append("video", file, file.name);
  const response = await fetch("/api/upload-video", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "本地视频上传失败。");
  return result;
}

function card(className, children) {
  const element = document.createElement("div");
  element.className = className;
  element.append(...children.filter(Boolean));
  return element;
}

function strong(text) {
  const element = document.createElement("strong");
  element.textContent = text;
  return element;
}

function meta(text) {
  const element = document.createElement("p");
  element.className = "meta";
  element.textContent = text;
  return element;
}

function chips(items = []) {
  const wrapper = document.createElement("div");
  wrapper.append(...items.map((item) => chip(item)));
  return wrapper;
}

function chip(text, tone = "") {
  const element = document.createElement("span");
  element.className = `tag ${tone}`.trim();
  element.textContent = label(text);
  return element;
}

function label(value) {
  const raw = String(value || "");
  const translations = {
    student_video: "学生视频",
    action_evidence: "动作证据",
    knowledge_retrieval: "知识检索",
    ai_draft: "AI 草稿",
    coach_confirmation: "教练确认",
    student_training_plan: "学生训练计划",
    retest_video: "复测视频",
    long_term_progress_trend: "长期进步趋势",
    coach_lesson: "线下课视频",
    athlete_homework: "作业/复测视频",
    homework_retest_uploaded: "复测视频待复盘",
    waiting_for_coach_confirmation: "等待教练确认",
    ai_draft_ready_for_coach_edit: "AI 草稿待编辑",
    priority: "重点学生",
    normal: "普通",
    coach_feedback: "教练反馈",
    training_task_drafts: "训练任务草稿",
    hand_leads_before_lower_body: "手快脚慢",
    lower_body_ball_transfer_disconnect: "上下肢脱节",
    low_release_point: "释放点低",
    correction: "纠正训练",
    transfer: "迁移训练",
    retest: "复测任务",
    boundary_refusal: "边界拒答",
    rate_limited: "今日次数已用完",
    general_training_explanation_draft: "通用训练解释草稿",
    Ball_lift_delay: "起球延迟",
    "Ball lift delay": "起球延迟",
    Release_line_offset: "出手力线偏移",
    "Release line offset": "出手力线偏移",
    improved: "改善",
    regressed: "退步",
    flat: "持平",
    not_enough_history: "历史不足",
    ai_drafts_are_not_student_final_decisions: "AI 草稿不是学生最终结论",
    coach_feedback_student_source_of_truth: "学生端以教练反馈为准",
    llm_receives_raw_video: "大模型接收原始视频",
    organization_optimization_scope: "机构优化范围",
    same_organization_only: "仅限同机构",
    cross_organization_sharing_in_mvp: "MVP 跨机构共享",
    student_video_public_by_default: "学生视频默认公开",
    audited_delete_actions: "独立审计删除动作",
    video: "视频",
    session: "复盘记录",
    athlete_data: "学生数据",
    student_knowledge_questions_saved: "保存学生知识提问",
    knowledge_assistant_personal_video_diagnosis_allowed: "知识助手允许个人视频诊断",
    local_mock_phone_login: "本地模拟手机登录",
    local_invite_phone_binding: "本地邀请手机绑定",
    ai_report_drafts: "AI 报告草稿",
    coach_edit_diff_json: "教练编辑差异",
    rejected_problem_tags: "被拒绝的问题标签",
    coach_confirms_primary_and_secondary_problem_tags: "教练确认主问题和次问题",
    ai_draft_json: "AI 草稿 JSON",
    coach_feedback_published: "教练反馈已发布",
    completed_by_self_report: "已自报完成",
    retest_uploaded: "复测已上传",
    supplemental_wrong_view_uploaded: "错误视角补充视频已上传",
    lesson_uploaded_waiting_for_coach_confirmation: "课堂视频等待教练确认",
    ineffective_plan_needs_action: "训练计划无效，需要教练调整",
    repeated_unresolved_problem: "重复未解决",
    waiting_too_long: "等待时间较长",
    priority_student: "优先学生",
    important: "重要",
    supplemental_wrong_view_record: "错误视角补充记录",
    coach_reviewed: "教练已复盘",
    effective: "有效",
    ineffective: "无效",
    watching: "继续观察",
    unrated: "暂不评价",
    coach_reviews_effectiveness: "教练复盘训练效果",
    trend_can_compare_confirmed_task_context: "可进入同轨趋势比较",
    video_deleted: "视频删除",
    session_deleted: "Session 删除",
    athlete_data_deleted: "学生数据删除",
    review_video_playback_unavailable: "复盘视频不可播放",
    session_hidden_from_review_and_trends: "Session 已从复盘和趋势隐藏",
    local_arc_lab_athlete_data_soft_delete_separate_audit_action: "学生数据软删除审计合同",
    training_sessions: "Session",
    video_assets: "视频资产",
    coach_feedback: "教练反馈",
    training_tasks: "训练任务",
    metric_snapshots: "指标快照",
    trend_explanations: "趋势说明",
    knowledge_usage: "知识用量",
    not_applied_to_live_supabase_project: "未应用到在线 Supabase",
    auth_sms_provider_not_configured: "未配置短信登录",
    storage_object_bytes_not_uploaded_by_local_contract: "本地合同未上传云端视频字节",
    blocked_missing_environment_or_sql_contract: "缺少生产环境配置或 SQL 合同未通过",
    ready_for_manual_live_verification: "可进入人工 live 验证",
    supabase_project: "Supabase 项目",
    supabase_migration_apply: "Migration 应用",
    sms_auth: "短信登录",
    storage_boundary: "私有存储",
    student_uploads_requested_view_retest: "请上传要求视角的复测",
    active: "待绑定",
    phone_bound: "已绑定",
    expired: "已过期",
    false: "否",
    true: "是"
  };
  return translations[raw] || raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
