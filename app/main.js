const state = {
  evidencePacket: null,
  report: null,
  videoDurationMs: 0,
  browserPoseDetected: false,
  poseSamples: [],
  upload: null,
  pairedUpload: null,
  poseLandmarker: null,
  poseLoopActive: false,
  modelHealth: null,
  browserPoseDiagnostics: null,
  precisionPose: null,
  multiAngleEvidence: null,
  releaseMotion: null,
  phaseKeyframes: [],
  annotatedFrameReviews: [],
  samples: [],
  sampleReadiness: null,
  sample: null
};

const PRODUCT_BOUNDARY_COPY = {
  ballTrajectory: "不是稳定 2D 球轨迹承诺",
  implementation: "未实现即不可承诺"
};

const COCO_CONNECTIONS = [
  [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16]
];

const MEDIAPIPE_POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28
};

const MASTHEAD_POSTER_SLIDES = Array.from({ length: 18 }, (_, index) => {
  const fileNumber = 6351 + index;
  return {
    image: `/assets/poster/new-set/IMG_${fileNumber}.JPG`,
    subjectImage: `/assets/poster/subjects/centered-new-set/IMG_${fileNumber}-subject.png`
  };
});

const COCO_POSE = {
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16
};

renderDefaultMetrics();
renderDefaultKeyframes();
renderDefaultCharts();
loadKnowledge();
loadSessions();
loadMemorySummary();
loadPrivacyBoundary();
loadModelHealth();
loadSamples();
loadAuthorizedSampleReadiness();
initNavigation();
initPosterTransition();
initMastheadCarousel();
initLabEntryMotion();
initVideoControls();
initFrameExportControls();
initSampleControls();
initAnalyzeButton();
initAlphaTestControls();
initBrowserPose().catch((error) => {
  setPoseStatus("MediaPipe 未启用；当前不会显示骨架，只显示证据包和指标。");
  renderPipelineNotice(`MediaPipe 快速层未启用：${error.message}`);
});

function initNavigation() {
  const isIntroEntry = new URLSearchParams(window.location.search).get("intro") === "1";
  const initialSection = window.location.hash?.slice(1) || "workbench";
  showView(normalizeViewSection(initialSection), { scroll: false, preserveHash: isIntroEntry });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.href) {
        window.location.href = button.dataset.href;
        return;
      }
      showView(normalizeViewSection(button.dataset.section), { scroll: true });
    });
  });

  window.addEventListener("hashchange", () => {
    showView(window.location.hash?.slice(1) || "workbench", { scroll: false });
  });
}

function normalizeViewSection(section) {
  if (section === "workbench" || section === "upload" || section === "analysis") return "workbench";
  if (section === "logs" || section === "lab" || section === "knowledge") return "logs";
  if (section === "memory") return "memory";
  return "workbench";
}

function showView(section, options = {}) {
  const normalized = normalizeViewSection(section);
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.hidden = panel.id !== normalized;
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", normalizeViewSection(item.dataset.section) === normalized);
  });
  const target = document.getElementById(normalized);
  if (target && options.scroll) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (!options.preserveHash && window.location.hash !== `#${normalized}`) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${normalized}`);
  }
}

function initLabEntryMotion() {
  const params = new URLSearchParams(window.location.search);
  const hasIntroEntry = params.get("intro") === "1" || sessionStorage.getItem("arcLabIntroPending") === "1";
  if (!hasIntroEntry) return;
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  holdIntroAtTop();
  params.delete("intro");
  const cleanQuery = params.toString();
  const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`;
  window.history.replaceState({}, "", cleanUrl);

  if (prefersReducedPosterMotion()) {
    requestAnimationFrame(scrollToPosterTop);
    playWorkbenchEntry({ reduced: true, finalizeHash: true });
    return;
  }

  requestAnimationFrame(() => {
    scrollToPosterTop();
    playWorkbenchEntry({ finalizeHash: true });
  });
}

function holdIntroAtTop() {
  scrollToPosterTop();
  requestAnimationFrame(scrollToPosterTop);
}

function createPosterTransitionStage(slide) {
  const overlay = document.createElement("div");
  overlay.className = "poster-transition-stage";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="poster-transition-backdrop"></div>
    <div class="poster-transition-grain"></div>
    <div class="poster-transition-court"></div>
    <div class="poster-transition-title">
      <p>${escapeHtml(formatPosterDate())}</p>
      <h2><span>ARC</span><span>LAB</span></h2>
    </div>
    <img class="poster-transition-athlete" src="${escapeHtml(slide.subjectImage)}" alt="" />
    <div class="poster-transition-copy">
      <strong>Upload film. Build evidence. Get the coach report.</strong>
      <span>本地视频进入证据包流水线，报告、姿态切片、记忆库在同一工作台完成。</span>
    </div>
    <button class="poster-transition-cta" type="button" tabindex="-1">Start Your Shot Analysis</button>
  `;
  overlay.querySelector(".poster-transition-backdrop")?.style.setProperty("--poster-transition-bg", `url("${slide.image}")`);
  return overlay;
}

function syncPosterTransitionMetrics(overlay) {
  const masthead = document.getElementById("dockedPoster");
  if (!masthead) return;
  const titleSource = overlay.querySelector(".poster-transition-title")?.getBoundingClientRect();
  const athleteSource = overlay.querySelector(".poster-transition-athlete")?.getBoundingClientRect();
  const copySource = overlay.querySelector(".poster-transition-copy")?.getBoundingClientRect();
  const backdropSource = overlay.querySelector(".poster-transition-backdrop")?.getBoundingClientRect();
  const titleTarget = masthead.querySelector(".lab-masthead-title")?.getBoundingClientRect();
  const athleteTarget = document.getElementById("mastheadAthlete")?.getBoundingClientRect();
  const copyTarget = masthead.querySelector(".lab-masthead-copy")?.getBoundingClientRect();
  const backdropTarget = masthead.getBoundingClientRect();

  if (titleSource && titleTarget) setTopLeftTransitionVars("title", titleSource, titleTarget);
  if (athleteSource && athleteTarget) setCenterTransitionVars("athlete", athleteSource, athleteTarget);
  if (copySource && copyTarget) setTopLeftTransitionVars("copy", copySource, copyTarget);
  if (backdropSource && backdropTarget) setBoxTransitionVars("bg", backdropSource, backdropTarget);
}

function setTopLeftTransitionVars(name, sourceRect, targetRect) {
  const scale = Math.min(targetRect.width / sourceRect.width, targetRect.height / sourceRect.height);
  document.body.style.setProperty(`--poster-${name}-x`, `${Math.round(targetRect.left - sourceRect.left)}px`);
  document.body.style.setProperty(`--poster-${name}-y`, `${Math.round(targetRect.top - sourceRect.top)}px`);
  document.body.style.setProperty(`--poster-${name}-scale`, String(Number(scale.toFixed(3))));
}

function setCenterTransitionVars(name, sourceRect, targetRect) {
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const scale = Math.min(targetRect.width / sourceRect.width, targetRect.height / sourceRect.height);
  document.body.style.setProperty(`--poster-${name}-x`, `${Math.round(targetX - sourceX)}px`);
  document.body.style.setProperty(`--poster-${name}-y`, `${Math.round(targetY - sourceY)}px`);
  document.body.style.setProperty(`--poster-${name}-scale`, String(Number(scale.toFixed(3))));
}

function setBoxTransitionVars(name, sourceRect, targetRect) {
  document.body.style.setProperty(`--poster-${name}-x`, `${Math.round(targetRect.left - sourceRect.left)}px`);
  document.body.style.setProperty(`--poster-${name}-y`, `${Math.round(targetRect.top - sourceRect.top)}px`);
  document.body.style.setProperty(`--poster-${name}-scale-x`, String(Number((targetRect.width / sourceRect.width).toFixed(4))));
  document.body.style.setProperty(`--poster-${name}-scale-y`, String(Number((targetRect.height / sourceRect.height).toFixed(4))));
}

function playWorkbenchEntry(options = {}) {
  document.body.classList.add("lab-entry-ready");
  if (options.reduced) document.body.classList.add("lab-entry-reduced");
  clearLabEntryPending();
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.body.classList.add("lab-entry-play");
      window.setTimeout(() => {
        document.body.classList.remove("lab-entry-ready", "lab-entry-play", "lab-entry-reduced");
        if (options.finalizeHash) {
          window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#workbench`);
          scrollToPosterTop();
          requestAnimationFrame(scrollToPosterTop);
        }
      }, options.reduced ? 280 : 980);
    }, options.reduced ? 20 : 40);
  });
}

function clearLabEntryPending() {
  document.documentElement.classList.remove("lab-entry-pending");
  sessionStorage.removeItem("arcLabIntroPending");
}

function formatPosterDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date()).replace(",", "");
}

function initPosterTransition() {
  const dockedPoster = document.getElementById("dockedPoster");
  if (!dockedPoster) return;

  scrollToPosterTop();
  dockedPoster.addEventListener("click", () => {
    sessionStorage.setItem("arcLabPosterSlideIndex", String(state.mastheadSlideIndex || 0));
    window.location.href = "/poster.html";
  });
  dockedPoster.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    sessionStorage.setItem("arcLabPosterSlideIndex", String(state.mastheadSlideIndex || 0));
    window.location.href = "/poster.html";
  });
}

function initMastheadCarousel() {
  const masthead = document.getElementById("dockedPoster");
  const currentImage = document.getElementById("mastheadAthlete");
  const nextImage = document.getElementById("mastheadAthleteNext");
  if (!masthead || !currentImage || !nextImage) return;

  let activeIndex = getStoredPosterSlideIndex();
  state.mastheadSlideIndex = activeIndex;
  applyMastheadSlide(masthead, currentImage, activeIndex);
  preloadMastheadNext(nextImage, activeIndex);

  window.setInterval(() => {
    const nextIndex = (activeIndex + 1) % MASTHEAD_POSTER_SLIDES.length;
    nextImage.src = MASTHEAD_POSTER_SLIDES[nextIndex].subjectImage;
    masthead.style.setProperty("--masthead-bg", `url("${MASTHEAD_POSTER_SLIDES[nextIndex].image}")`);
    masthead.classList.add("is-transitioning");
    window.setTimeout(() => {
      activeIndex = nextIndex;
      state.mastheadSlideIndex = activeIndex;
      currentImage.src = MASTHEAD_POSTER_SLIDES[activeIndex].subjectImage;
      masthead.classList.remove("is-transitioning");
      preloadMastheadNext(nextImage, activeIndex);
    }, prefersReducedPosterMotion() ? 20 : 620);
  }, 3600);
}

function applyMastheadSlide(masthead, image, index) {
  const slide = MASTHEAD_POSTER_SLIDES[index] || MASTHEAD_POSTER_SLIDES[0];
  image.src = slide.subjectImage;
  masthead.style.setProperty("--masthead-bg", `url("${slide.image}")`);
}

function preloadMastheadNext(image, activeIndex) {
  const nextIndex = (activeIndex + 1) % MASTHEAD_POSTER_SLIDES.length;
  image.src = MASTHEAD_POSTER_SLIDES[nextIndex].subjectImage;
}

function getStoredPosterSlideIndex() {
  const raw = Number.parseInt(sessionStorage.getItem("arcLabPosterSlideIndex") || "17", 10);
  if (!Number.isFinite(raw)) return 17;
  return Math.min(Math.max(raw, 0), MASTHEAD_POSTER_SLIDES.length - 1);
}

function prefersReducedPosterMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToPosterTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function initVideoControls() {
  const input = document.getElementById("videoInput");
  const video = document.getElementById("shotVideo");
  const canvas = document.getElementById("poseCanvas");
  document.getElementById("cameraView")?.addEventListener("change", updateInputContractWarnings);
  document.getElementById("pairedCameraView")?.addEventListener("change", updateInputContractWarnings);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    state.sample = null;
    clearAnnotatedFrameReview();
    video.src = URL.createObjectURL(file);
    video.classList.add("loaded");
    document.getElementById("emptyVideo").style.display = "none";
    document.getElementById("sessionTitle").textContent = `本地训练 - ${file.name}`;
    document.getElementById("fileInfo").textContent = `${file.name} · ${formatBytes(file.size)} · 正在保存到本机后端`;
    setPoseStatus("视频已载入。播放时会尝试用 MediaPipe 检测人体；检测不到时不会绘制骨架。");
    try {
      state.upload = await uploadVideo(file);
      applyUploadMetadata(state.upload.metadata);
      document.getElementById("fileInfo").textContent =
        `${file.name} · ${formatBytes(file.size)} · 已保存到本机后端 · ${metadataLabel(state.upload.metadata)}`;
      updateInputContractWarnings();
      updateUploadDeleteButtons();
    } catch (error) {
      state.upload = null;
      document.getElementById("fileInfo").textContent =
        `${file.name} · ${formatBytes(file.size)} · 后端保存失败：${error.message}`;
      updateInputContractWarnings();
      updateUploadDeleteButtons();
    }
  });

  const pairedInput = document.getElementById("pairedVideoInput");
  pairedInput.addEventListener("change", async () => {
    const file = pairedInput.files?.[0];
    if (!file) return;
    document.getElementById("pairedFileInfo").textContent = `${file.name} · ${formatBytes(file.size)} · 正在保存到本机后端`;
    try {
      state.pairedUpload = await uploadVideo(file);
      document.getElementById("pairedFileInfo").textContent =
        `${file.name} · ${formatBytes(file.size)} · 已保存到本机后端 · ${metadataLabel(state.pairedUpload.metadata)}`;
      updateInputContractWarnings();
      renderMultiAnglePending();
      updateUploadDeleteButtons();
    } catch (error) {
      state.pairedUpload = null;
      document.getElementById("pairedFileInfo").textContent =
        `${file.name} · ${formatBytes(file.size)} · 后端保存失败：${error.message}`;
      updateInputContractWarnings();
      updateUploadDeleteButtons();
    }
  });

  video.addEventListener("loadedmetadata", () => {
    state.videoDurationMs = Math.round((video.duration || 0) * 1000);
    const label = input.files?.[0]?.name || state.sample?.file_name || "local video";
    document.getElementById("fileInfo").textContent =
      `${label} · ${formatDuration(video.duration)} · ${video.videoWidth}x${video.videoHeight}` +
      (state.upload?.metadata ? ` · ${metadataLabel(state.upload.metadata)}` : "");
    updateInputContractWarnings();
    syncVideoStage(video);
    sizePoseCanvas(video, canvas);
    updateFrameExportButton();
    updateTimeReadout();
    drawPrecisionPoseAtTime(video.currentTime * 1000);
  });

  video.addEventListener("timeupdate", () => {
    updateTimeReadout();
    if (video.paused) drawPrecisionPoseAtTime(video.currentTime * 1000);
  });
  video.addEventListener("seeked", () => {
    drawPrecisionPoseAtTime(video.currentTime * 1000);
  });
  video.addEventListener("play", startPoseLoop);
  video.addEventListener("pause", () => {
    state.poseLoopActive = false;
    drawPrecisionPoseAtTime(video.currentTime * 1000);
  });
  window.addEventListener("resize", () => {
    syncVideoStage(video);
    sizePoseCanvas(video, canvas);
    drawPrecisionPoseAtTime(video.currentTime * 1000);
  });

  document.getElementById("playButton").addEventListener("click", () => {
    if (!video.src) return;
    if (video.paused) video.play();
    else video.pause();
  });

  document.getElementById("deleteUploadButton")?.addEventListener("click", async () => {
    await deleteCurrentUpload("primary");
  });
  document.getElementById("deletePairedUploadButton")?.addEventListener("click", async () => {
    await deleteCurrentUpload("paired");
  });
}

async function deleteCurrentUpload(target) {
  const isPaired = target === "paired";
  const upload = isPaired ? state.pairedUpload : state.upload;
  if (!upload?.upload_id) return;
  if (!confirm("只删除本机 data/uploads 中的原始上传文件；不会删除 SQLite session。确认删除？")) return;
  const button = document.getElementById(isPaired ? "deletePairedUploadButton" : "deleteUploadButton");
  if (button) button.disabled = true;
  try {
    await deleteUpload(upload.upload_id);
    if (isPaired) {
      state.pairedUpload = null;
      document.getElementById("pairedVideoInput").value = "";
      document.getElementById("pairedFileInfo").textContent = "补充视角原始文件已从本机上传目录删除。";
      updateInputContractWarnings();
      renderMultiAnglePending();
    } else {
      state.upload = null;
      state.evidencePacket = null;
      document.getElementById("videoInput").value = "";
      document.getElementById("fileInfo").textContent = "当前原始上传文件已从本机上传目录删除；重新分析前请重新选择视频。";
      updateInputContractWarnings();
      updateFrameExportButton();
    }
  } catch (error) {
    const info = document.getElementById(isPaired ? "pairedFileInfo" : "fileInfo");
    if (info) info.textContent = `删除失败：${error.message}`;
  } finally {
    updateUploadDeleteButtons();
  }
}

function initFrameExportControls() {
  const button = document.getElementById("exportFrameButton");
  if (!button) return;
  button.addEventListener("click", () => {
    try {
      const result = exportAnnotatedFrame({ download: true });
      addAnnotatedFrameReview(result);
      setFrameExportStatus(`已在本地生成 PNG：${result.width}x${result.height}，当前帧 ${result.time_ms}ms；没有导出视频或上传云端。`);
    } catch (error) {
      setFrameExportStatus(`导出失败：${error.message}`);
    }
  });
  updateFrameExportButton();
}

function updateFrameExportButton() {
  const button = document.getElementById("exportFrameButton");
  const video = document.getElementById("shotVideo");
  if (button) button.disabled = !(video?.src && video.videoWidth && video.videoHeight);
}

function setFrameExportStatus(message) {
  const target = document.getElementById("frameExportStatus");
  if (target) target.textContent = message;
}

function addAnnotatedFrameReview(result) {
  if (!result?.data_url) return;
  state.annotatedFrameReviews = [
    {
      data_url: result.data_url,
      width: result.width,
      height: result.height,
      time_ms: result.time_ms,
      created_at: new Date().toISOString(),
      source_contract: result.source_contract
    },
    ...state.annotatedFrameReviews
  ].slice(0, 3);
  renderAnnotatedFrameReview();
}

function clearAnnotatedFrameReview() {
  state.annotatedFrameReviews = [];
  renderAnnotatedFrameReview();
}

function renderAnnotatedFrameReview() {
  const target = document.getElementById("annotatedFrameReview");
  if (!target) return;
  if (!state.annotatedFrameReviews.length) {
    target.innerHTML = '<p class="muted">导出后会在本机浏览器内显示最近 3 张标注帧预览；不会写入服务器、导出视频或上传云端。</p>';
    return;
  }
  target.innerHTML = `
    <div class="annotated-frame-review-header">
      <strong>最近标注帧</strong>
      <span>local PNG review · no video export · no cloud upload</span>
    </div>
    <div class="annotated-frame-strip">
      ${state.annotatedFrameReviews.map((item, index) => `
        <figure class="annotated-frame-thumb">
          <img src="${escapeHtml(item.data_url)}" alt="本地标注帧预览 ${index + 1}" />
          <figcaption>
            <strong>${Math.round(item.time_ms)}ms</strong>
            <span>${escapeHtml(item.width)}x${escapeHtml(item.height)}</span>
          </figcaption>
        </figure>
      `).join("")}
    </div>
    <p class="muted">仅保存在当前浏览器内存；刷新页面后消失，不写入 SQLite 或 data/uploads。</p>
  `;
}

function updateUploadDeleteButtons() {
  const primaryButton = document.getElementById("deleteUploadButton");
  const pairedButton = document.getElementById("deletePairedUploadButton");
  if (primaryButton) primaryButton.disabled = !state.upload?.upload_id;
  if (pairedButton) pairedButton.disabled = !state.pairedUpload?.upload_id;
}

function initSampleControls() {
  document.getElementById("loadSampleButton")?.addEventListener("click", () => {
    loadSelectedSample().catch((error) => {
      const target = document.getElementById("sampleStatus");
      if (target) target.textContent = `样例加载失败：${error.message}`;
    });
  });
}

async function loadSamples() {
  const status = document.getElementById("sampleStatus");
  const select = document.getElementById("sampleSelect");
  const button = document.getElementById("loadSampleButton");
  if (!status || !select || !button) return;
  try {
    const result = await fetch("/api/samples").then((res) => res.json());
    state.samples = result.samples || [];
    select.innerHTML = state.samples.map((sample) =>
      `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.title || sample.id)}</option>`
    ).join("");
    select.disabled = state.samples.length === 0;
    button.disabled = state.samples.length === 0;
    status.textContent = state.samples.length
      ? `${state.samples.length} 个本地授权样例；只用于 local_acceptance_test。`
      : "没有可用的本地授权样例。";
  } catch (error) {
    state.samples = [];
    select.innerHTML = "";
    select.disabled = true;
    button.disabled = true;
    status.textContent = `样例清单读取失败：${error.message}`;
  }
}

async function loadAuthorizedSampleReadiness() {
  const statusEl = document.getElementById("sampleReadinessStatus");
  const target = document.getElementById("sampleReadiness");
  if (!target) return;
  try {
    const result = await fetch("/api/authorized-sample-readiness").then((res) => res.json());
    state.sampleReadiness = result;
    if (statusEl) statusEl.textContent = result.status || "unknown";
    const required = result.required_metadata || [];
    const invalid = result.errors || [];
    target.innerHTML = `
      <div class="report-meta">
        <span>${escapeHtml(result.schema_version || "authorized_sample_readiness_audit.v1")}</span>
        <span>${escapeHtml(result.source_contract || "metadata_only_no_video_file_access")}</span>
      </div>
      <div class="report-evidence">
        <div><span>当前状态</span><strong>${escapeHtml(result.status || "unknown")}</strong><small>当前 manifest 仍不读取真实视频文件</small></div>
        <div><span>候选样例</span><strong>${Number(result.candidate_sample_count || 0)}</strong><small>source_type=representative_authorized / real_school_team_authorized</small></div>
        <div><span>可验收样例</span><strong>${Number(result.ready_sample_count || 0)}</strong><small>仅代表 metadata ready，不代表诊断质量</small></div>
        <div><span>必需授权范围</span><strong>${escapeHtml((result.required_scope || []).join(" + ") || "local_analysis + local_acceptance_test")}</strong><small>不得包含 public/cloud/training scopes</small></div>
        <div><span>失败项</span><strong>${invalid.length}</strong><small>${invalid.length ? "需补齐授权 metadata" : "当前无非法候选样例"}</small></div>
      </div>
      <h4>进入真实/代表性样例前必须具备</h4>
      ${required.slice(0, 6).map((item) => `<p class="muted">${escapeHtml(item)}</p>`).join("")}
      <p class="warning">metadata-only gate：不读取、不上传、不解码真实视频；当前不会把真实校队视频纳入验收。</p>
    `;
  } catch (error) {
    state.sampleReadiness = null;
    if (statusEl) statusEl.textContent = "unavailable";
    target.innerHTML = `<p class="warning">样例授权门禁读取失败：${escapeHtml(error.message)}</p>`;
  }
}

async function loadSelectedSample() {
  const select = document.getElementById("sampleSelect");
  const sample = state.samples.find((item) => item.id === select?.value);
  if (!sample) throw new Error("sample_not_found");
  const video = document.getElementById("shotVideo");
  const canvas = document.getElementById("poseCanvas");
  state.sample = sample;
  state.upload = null;
  state.evidencePacket = null;
  state.precisionPose = null;
  state.releaseMotion = null;
  state.poseSamples = [];
  state.browserPoseDetected = false;
  clearAnnotatedFrameReview();
  document.getElementById("videoInput").value = "";
  video.src = sample.video_url;
  video.classList.add("loaded");
  document.getElementById("emptyVideo").style.display = "none";
  document.getElementById("sessionTitle").textContent = `授权样例 - ${sample.title || sample.id}`;
  document.getElementById("fileInfo").textContent =
    `${sample.file_name} · ${sample.source_type} · ${sample.authorization?.notes || "本地授权样例"}`;
  document.getElementById("sampleStatus").textContent =
    `${sample.id} 已加载；${sample.expected_use?.diagnosis_confidence || "仅用于本地验收"}`;
  setSelectValue("cameraView", sample.camera_view || "unknown");
  document.getElementById("trainingGoal").value = "Phase 1 本地授权样例闭环验收";
  setSelectValue("memoryStatus", "short_term_review");
  document.getElementById("videoFps").value = sample.fps ? Number(sample.fps).toFixed(2) : "";
  updateInputContractWarnings();
  setPoseStatus("授权样例已加载。播放时会尝试绘制 MediaPipe 骨架；synthetic sample 不用于真实球员诊断。");
  updateUploadDeleteButtons();
  syncVideoStage(video);
  sizePoseCanvas(video, canvas);
  updateTimeReadout();
}

function setSelectValue(id, value) {
  const select = document.getElementById(id);
  if (!select) return;
  if (![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

function initAnalyzeButton() {
  document.getElementById("analyzeButton").addEventListener("click", async () => {
    const file = document.getElementById("videoInput").files?.[0];
    const poseSamples = await collectPoseSamples();
    const payload = {
      file_name: file?.name || state.sample?.file_name || "sample-side-view.mp4",
      camera_view: document.getElementById("cameraView").value,
      dominant_hand: document.getElementById("dominantHand").value,
      training_goal: document.getElementById("trainingGoal").value,
      shot_type: state.sample?.shot_type || "定点三分",
      fps: Number(document.getElementById("videoFps").value || state.upload?.metadata?.fps || 0) || null,
      video_duration_ms: state.videoDurationMs || state.sample?.duration_ms || 4200,
      browser_pose_detected: poseSamples.length > 0,
      pose_samples: poseSamples,
      browser_pose_diagnostics: state.browserPoseDiagnostics,
      observed_fps: state.upload?.metadata?.fps || null,
      upload_metadata: state.upload?.metadata || null,
      upload_id: state.upload?.upload_id || null,
      sample_id: state.upload?.upload_id ? null : state.sample?.id || null,
      sample_source_type: state.sample?.source_type || null
    };

    try {
      setReportLoading();
      const evidence = await postJson("/api/analyze-video", payload);
      state.evidencePacket = evidence;
      renderEvidence(evidence);
      if (state.pairedUpload?.upload_id) {
        state.multiAngleEvidence = await analyzeMultiAngle(payload);
        renderMultiAngleEvidence(state.multiAngleEvidence);
      } else {
        state.multiAngleEvidence = null;
        renderMultiAnglePending();
      }

      const reportEvidence = state.multiAngleEvidence || evidence;
      const coach = await postJson("/api/coach-report", reportEvidence);
      state.report = coach.report;

      const saved = await postJson("/api/sessions", {
        session_id: reportEvidence.session_group_id || evidence.session_id,
        title: payload.file_name,
        evidence: reportEvidence,
        report: coach.report,
        memory_status: document.getElementById("memoryStatus")?.value || "long_term",
        feedback: collectFeedback()
      });

      renderReport(coach, saved);
      await loadSessions();
      await loadMemorySummary();
    } catch (error) {
      document.getElementById("coachReport").innerHTML =
        `<p class="warning">分析失败：${escapeHtml(error.message)}</p>`;
    }
  });
}

function initAlphaTestControls() {
  const button = document.getElementById("runAlphaTestButton");
  if (!button) return;
  button.addEventListener("click", async () => {
    const resultEl = document.getElementById("alphaTestResult");
    const statusEl = document.getElementById("alphaTestStatus");
    const agreementId = document.getElementById("alphaAgreementId")?.value?.trim();
    const accepted = document.getElementById("alphaLocalAuthorization")?.checked === true;
    if (!state.upload?.upload_id) {
      resultEl.innerHTML = `<p class="warning">请先上传本地视频；Alpha 测试不会读取授权样例或云端文件。</p>`;
      return;
    }
    if (!agreementId || !accepted) {
      resultEl.innerHTML = `<p class="warning">需要填写授权记录 ID，并确认本地-only/禁止公开/禁止云端/禁止训练模型。</p>`;
      return;
    }
    button.disabled = true;
    if (statusEl) statusEl.textContent = "running";
    resultEl.innerHTML = `<p class="muted">正在运行本地授权 Alpha 分析；结果只写入 short_term_review。</p>`;
    try {
      const payload = {
        upload_id: state.upload.upload_id,
        tester_agreement_id: agreementId,
        file_name: state.upload.file_name,
        camera_view: document.getElementById("cameraView").value,
        dominant_hand: document.getElementById("dominantHand").value,
        training_goal: document.getElementById("trainingGoal").value,
        shot_type: "授权 Alpha 本地测试",
        fps: Number(document.getElementById("videoFps").value || state.upload?.metadata?.fps || 0) || null,
        video_duration_ms: state.videoDurationMs || state.upload?.metadata?.duration_ms || 4200,
        observed_fps: state.upload?.metadata?.fps || null,
        upload_metadata: state.upload?.metadata || null,
        browser_pose_detected: state.poseSamples.length > 0,
        pose_samples: state.poseSamples,
        browser_pose_diagnostics: state.browserPoseDiagnostics,
        user_id: "alpha_tester_local",
        authorization: {
          tester_agreement_id: agreementId,
          local_analysis: true,
          local_acceptance_test: true,
          allow_public_showcase: false,
          allow_external_distribution: false,
          allow_cloud_storage: false,
          allow_model_training: false
        }
      };
      const alpha = await postJson("/api/authorized-alpha-analysis", payload);
      if (alpha.status !== "review_only") {
        throw new Error(alpha.authorization?.errors?.map((item) => item.code).join(", ") || alpha.status);
      }
      state.evidencePacket = alpha.evidence_packet;
      state.report = alpha.coach_report?.report;
      renderEvidence(alpha.evidence_packet);
      renderReport(alpha.coach_report, alpha.saved_session);
      await loadSessions();
      await loadMemorySummary();
      await loadPrivacyBoundary();
      if (statusEl) statusEl.textContent = "review only";
      resultEl.innerHTML = `
        <p class="muted">Alpha 分析完成：${escapeHtml(alpha.schema_version)} · ${escapeHtml(alpha.source_contract)}</p>
        <p class="warning">review_only / not_for_player_diagnosis / short_term_review_only</p>
      `;
    } catch (error) {
      if (statusEl) statusEl.textContent = "error";
      resultEl.innerHTML = `<p class="warning">Alpha 授权分析失败：${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  });
}

async function analyzeMultiAngle(primaryPayload) {
  const primaryView = primaryPayload.camera_view;
  const pairedView = document.getElementById("pairedCameraView").value;
  return postJson("/api/analyze-multi-angle", {
    session_group_id: `group_${Date.now()}`,
    user_id: "local_user_001",
    shot_type: primaryPayload.shot_type,
    dominant_hand: primaryPayload.dominant_hand,
    training_goal: primaryPayload.training_goal,
    videos: [
      {
        ...primaryPayload,
        camera_view: primaryView,
        upload_id: state.upload?.upload_id || null,
        upload_metadata: state.upload?.metadata || null,
        evidence_packet: state.evidencePacket?.schema_version === "evidence_packet.v1" ? state.evidencePacket : null
      },
      {
        file_name: state.pairedUpload.file_name,
        camera_view: pairedView,
        dominant_hand: primaryPayload.dominant_hand,
        training_goal: primaryPayload.training_goal,
        shot_type: primaryPayload.shot_type,
        fps: state.pairedUpload.metadata?.fps || primaryPayload.fps || null,
        video_duration_ms: state.pairedUpload.metadata?.duration_ms || primaryPayload.video_duration_ms,
        observed_fps: state.pairedUpload.metadata?.fps || null,
        upload_metadata: state.pairedUpload.metadata || null,
        upload_id: state.pairedUpload.upload_id,
        pose_samples: [],
        browser_pose_diagnostics: {
          engine: "paired_video",
          runtime: "browser",
          called: false,
          failure_reason: "paired_view_pose_not_sampled_in_browser"
        }
      }
    ]
  });
}

function applyUploadMetadata(metadata) {
  const fpsInput = document.getElementById("videoFps");
  if (metadata?.fps) fpsInput.value = Number(metadata.fps).toFixed(2);
}

function metadataLabel(metadata) {
  if (!metadata?.fps) return "帧率待后端识别";
  return `${Number(metadata.fps).toFixed(2)}fps · ${metadata.frame_count || "?"}帧 · ${metadata.width || "?"}x${metadata.height || "?"}`;
}

function updateInputContractWarnings() {
  const target = document.getElementById("inputContractWarnings");
  if (!target) return;
  const primaryRows = buildInputContractRows({
    label: "主视角",
    hasInput: Boolean(state.upload?.upload_id || state.sample?.id || document.getElementById("shotVideo")?.src),
    view: document.getElementById("cameraView")?.value || "unknown",
    metadata: state.upload?.metadata || sampleMetadata(state.sample),
    durationMs: state.videoDurationMs || state.upload?.metadata?.duration_ms || state.sample?.duration_ms || null
  });
  const pairedRows = buildInputContractRows({
    label: "补充视角",
    hasInput: Boolean(state.pairedUpload?.upload_id),
    view: document.getElementById("pairedCameraView")?.value || "unknown",
    metadata: state.pairedUpload?.metadata || null,
    durationMs: state.pairedUpload?.metadata?.duration_ms || null
  });
  const rows = [...primaryRows, ...pairedRows];
  if (!rows.length) {
    target.innerHTML = `<p class="muted">上传后会按视角、帧率、时长和尺寸提示本次输入会如何降级。</p>`;
    return;
  }
  target.innerHTML = `
    <div class="report-evidence report-evidence-compact">
      ${rows.map((row) => `
        <div>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.status)}</strong>
          <small>${escapeHtml(row.detail)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function sampleMetadata(sample) {
  if (!sample) return null;
  return {
    fps: sample.fps || null,
    duration_ms: sample.duration_ms || null,
    width: sample.width || sample.dimensions?.width || null,
    height: sample.height || sample.dimensions?.height || null
  };
}

function buildInputContractRows({ label, hasInput, view, metadata, durationMs }) {
  if (!hasInput) return [];
  const rows = [];
  const fps = Number(metadata?.fps || 0);
  const width = Number(metadata?.width || metadata?.dimensions?.width || 0);
  const height = Number(metadata?.height || metadata?.dimensions?.height || 0);
  const duration = Number(durationMs || metadata?.duration_ms || 0);
  if (!["front", "side"].includes(view)) {
    rows.push({
      label: `${label}视角`,
      status: view === "unknown" ? "视角未确认" : "视角会降级",
      detail: `${view || "unknown"} 不是 Phase 4 最小 front/side 输入；相关结论会保持低置信并建议补拍。`
    });
  }
  if (!fps) {
    rows.push({
      label: `${label}帧率`,
      status: "帧率待确认",
      detail: "后端 metadata 未提供 fps；时序和同步判断会保持保守。"
    });
  } else if (fps < 30) {
    rows.push({
      label: `${label}帧率`,
      status: "低于基础合同",
      detail: `${fps.toFixed(2)}fps 低于 30fps；关键帧、同步和动作时序会降级，建议重拍。`
    });
  } else if (fps < 60) {
    rows.push({
      label: `${label}帧率`,
      status: "时序低置信",
      detail: `${fps.toFixed(2)}fps 可做本地复核，但时序/同步优先 60fps；报告不会给高置信时序结论。`
    });
  }
  if (!duration) {
    rows.push({
      label: `${label}时长`,
      status: "时长待确认",
      detail: "缺少 duration metadata；需要保留出手前后 1-2 秒上下文。"
    });
  } else if (duration < 1500) {
    rows.push({
      label: `${label}时长`,
      status: "视频过短",
      detail: `${duration}ms 少于 1500ms；可能缺少投篮前后上下文，建议重拍。`
    });
  }
  if (width && height && (width < 640 || height < 360)) {
    rows.push({
      label: `${label}尺寸`,
      status: "分辨率偏低",
      detail: `${width}x${height} 低于 640x360；关键点、球和篮筐识别风险升高。`
    });
  }
  if (!rows.length) {
    rows.push({
      label: `${label}输入`,
      status: "基础合同通过",
      detail: "metadata 满足本地输入合同；这仍不代表真实画面质量或诊断质量已验证。"
    });
  }
  return rows;
}

async function initBrowserPose() {
  const { FilesetResolver, PoseLandmarker, DrawingUtils } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );
  state.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  state.DrawingUtils = DrawingUtils;
  state.poseConnections = PoseLandmarker.POSE_CONNECTIONS;
  setPoseStatus("MediaPipe 快速层已就绪；上传视频播放时会尝试绘制真实人体关键点。");
  renderPipelineNotice("MediaPipe 快速层已就绪；上传视频播放时会尝试绘制浏览器端关键点。");
}

function startPoseLoop() {
  if (state.poseLoopActive) return;
  if (!hasPrecisionPose() && !state.poseLandmarker) return;
  state.poseLoopActive = true;
  requestAnimationFrame(runPoseFrame);
}

function runPoseFrame() {
  const video = document.getElementById("shotVideo");
  const canvas = document.getElementById("poseCanvas");
  if (!state.poseLoopActive || video.paused || video.ended || !video.videoWidth) return;

  if (hasPrecisionPose()) {
    drawPrecisionPoseAtTime(video.currentTime * 1000);
    requestAnimationFrame(runPoseFrame);
    return;
  }

  if (!state.poseLandmarker) {
    state.poseLoopActive = false;
    return;
  }

  sizePoseCanvas(video, canvas);
  const result = state.poseLandmarker.detectForVideo(video, performance.now());
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (result.landmarks?.[0]) {
    state.browserPoseDetected = true;
    const drawing = new state.DrawingUtils(ctx);
    drawing.drawLandmarks(result.landmarks[0], { radius: 3, color: "#68f07a" });
    drawing.drawConnectors(result.landmarks[0], state.poseConnections, {
      color: "#68f07a",
      lineWidth: 3
    });
    const lineCount = drawBrowserCoachLines(ctx, result.landmarks[0], canvas);
    const phase = drawPhaseLabel(ctx, canvas, video.currentTime * 1000);
    const releaseCount = drawReleaseMotionOverlay(ctx, canvas, state.releaseMotion, video.currentTime * 1000);
    renderOverlayDiagnostics({
      status: "browser_mediapipe",
      pose_source: "browser_mediapipe",
      line_count: lineCount,
      phase,
      release_count: releaseCount,
      guard_reason: lineCount ? "ok" : "visibility<0.5_or_missing_keypoints"
    });
    setPoseStatus(lineCount
      ? `已检测到人体关键点；骨架和 ${lineCount} 条教练线来自当前视频帧${phase ? `，阶段：${phase.label}` : ""}${releaseCount ? `；叠加 ${releaseCount} 个出手切片点` : ""}。`
      : `已检测到人体关键点；关键点不足时不绘制教练线${releaseCount ? `，已叠加 ${releaseCount} 个出手切片点` : ""}。`);
  } else {
    const releaseCount = drawReleaseMotionOverlay(ctx, canvas, state.releaseMotion, video.currentTime * 1000);
    renderOverlayDiagnostics({
      status: releaseCount ? "release_motion_only" : "no_pose",
      pose_source: "none",
      line_count: 0,
      phase: null,
      release_count: releaseCount,
      guard_reason: "no_human_keypoints"
    });
    setPoseStatus(releaseCount
      ? `当前帧未检测到人体关键点；不绘制静态假骨架，已叠加 ${releaseCount} 个出手切片点。`
      : "当前帧未检测到人体关键点；不绘制静态假骨架。");
  }
  requestAnimationFrame(runPoseFrame);
}

function hasPrecisionPose() {
  return Boolean(state.precisionPose?.pose_series?.length);
}

async function collectPoseSamples() {
  const video = document.getElementById("shotVideo");
  const diagnostics = {
    engine: "MediaPipe PoseLandmarker",
    runtime: "browser",
    called: false,
    samples_attempted: 0,
    samples_detected: 0,
    min_required: 6,
    resampling_enabled: true,
    coarse_samples_attempted: 0,
    supplemental_samples_attempted: 0,
    supplemental_samples_detected: 0,
    supplemental_window_ms: null,
    samples_used: 0,
    sample_points: [],
    failure_reason: null
  };
  if (!state.poseLandmarker || !video.src || !video.duration || !video.videoWidth) {
    diagnostics.failure_reason = !state.poseLandmarker ? "model_not_loaded" : !video.src ? "no_video" : "video_metadata_unavailable";
    state.browserPoseDiagnostics = diagnostics;
    setPoseStatus("MediaPipe 样本不可用；本次使用 fallback 指标，不绘制静态骨架。");
    return [];
  }

  const wasPaused = video.paused;
  const originalTime = video.currentTime || 0;
  if (!wasPaused) video.pause();
  const duration = video.duration;
  const times = buildPoseSampleTimes(duration);
  const samples = [];
  diagnostics.called = true;
  diagnostics.coarse_samples_attempted = times.length;

  for (const time of times) {
    const sample = await capturePoseSampleAtTime(video, time, "coarse");
    diagnostics.samples_attempted += 1;
    diagnostics.sample_points.push(sample.point);
    if (sample.poseSample) {
      diagnostics.samples_detected += 1;
      samples.push(sample.poseSample);
    }
  }

  const supplemental = buildSupplementalPoseSampleTimes(samples, duration);
  diagnostics.supplemental_samples_attempted = supplemental.times.length;
  diagnostics.supplemental_window_ms = supplemental.window;
  for (const time of supplemental.times) {
    const sample = await capturePoseSampleAtTime(video, time, "supplemental");
    diagnostics.samples_attempted += 1;
    diagnostics.sample_points.push(sample.point);
    if (sample.poseSample) {
      diagnostics.samples_detected += 1;
      diagnostics.supplemental_samples_detected += 1;
      samples.push(sample.poseSample);
    }
  }

  samples.sort((a, b) => a.time_ms - b.time_ms);
  samples.splice(0, samples.length, ...dedupePoseSamplesByTime(samples));
  diagnostics.samples_used = samples.length;
  await seekVideo(video, originalTime);
  if (!wasPaused) {
    video.play().catch(() => {});
  }

  state.poseSamples = samples;
  state.browserPoseDetected = samples.length > 0;
  diagnostics.failure_reason = samples.length >= diagnostics.min_required
    ? null
    : samples.length
      ? "less_than_min_required"
      : "no_landmarks";
  state.browserPoseDiagnostics = diagnostics;
  setPoseStatus(samples.length
    ? samples.length >= diagnostics.min_required
      ? `已采集 ${samples.length} 组 MediaPipe 关键点样本，其中补采 ${diagnostics.supplemental_samples_detected} 组真实帧。`
      : `仅采集 ${samples.length} 组 MediaPipe 关键点样本，低于 ${diagnostics.min_required} 组；本次会优先使用精度姿态或 fallback。`
    : "未采集到人体关键点；本次不会把骨架当作证据。");
  return samples;
}

async function capturePoseSampleAtTime(video, time, source) {
  const targetTime = Math.max(0, time);
  await seekVideo(video, targetTime);
  const point = { time_ms: Math.round(video.currentTime * 1000), detected: false };
  try {
    const result = state.poseLandmarker.detectForVideo(video, Math.round(performance.now()));
    if (result.landmarks?.[0]) {
      point.detected = true;
      point.landmark_count = result.landmarks[0].length;
      point.source = source;
      return {
        point,
        poseSample: {
          time_ms: Math.round(video.currentTime * 1000),
          source,
          landmarks: result.landmarks[0].map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z || 0,
            visibility: point.visibility ?? point.presence ?? 0.8
          }))
        }
      };
    } else {
      point.landmark_count = 0;
      point.source = source;
    }
  } catch (error) {
    point.error = error.message;
    point.source = source;
  }
  return { point, poseSample: null };
}

function buildPoseSampleTimes(duration) {
  const safeDuration = Math.max(0.4, Number(duration || 0));
  const sampleCount = safeDuration >= 6 ? 17 : 13;
  const start = Math.min(0.08 * safeDuration, Math.max(0, safeDuration - 0.35));
  const end = Math.max(start + 0.2, Math.min(safeDuration - 0.08, safeDuration * 0.92));
  const step = (end - start) / Math.max(1, sampleCount - 1);
  return Array.from({ length: sampleCount }, (_, index) => Math.min(safeDuration - 0.05, start + step * index));
}

function dedupePoseSamplesByTime(samples) {
  const deduped = [];
  for (const sample of samples) {
    const timeMs = Number(sample.time_ms || 0);
    if (deduped.some((item) => Math.abs(Number(item.time_ms || 0) - timeMs) < 30)) continue;
    deduped.push(sample);
  }
  return deduped;
}

function buildSupplementalPoseSampleTimes(samples, duration) {
  const rows = inferBrowserPoseRows(samples);
  if (rows.length < 3) return { times: [], window: null };
  const phase = inferBrowserShotPhase(rows);
  if (!phase?.release) return { times: [], window: null };
  const safeDurationMs = Math.max(400, Number(duration || 0) * 1000);
  const windowStartMs = clampNumber(phase.shotWindowStartMs, 0, safeDurationMs - 50);
  const windowEndMs = clampNumber(phase.shotWindowEndMs, windowStartMs + 80, safeDurationMs - 50);
  const anchors = [
    phase.shotWindowStartMs,
    phase.lowerBodyLoad?.time_ms,
    phase.liftStart?.time_ms,
    phase.setPoint?.time_ms,
    phase.release?.time_ms,
    phase.shotWindowEndMs
  ].filter(Number.isFinite);
  const existing = new Set(samples.map((sample) => Math.round(Number(sample.time_ms || 0))));
  const candidateTimesMs = [];
  for (const anchor of anchors) {
    for (const offset of [-120, -80, -40, 40, 80, 120]) {
      const value = clampNumber(anchor + offset, windowStartMs, windowEndMs);
      if (isNearExistingTime(value, existing, candidateTimesMs)) continue;
      candidateTimesMs.push(value);
    }
  }
  candidateTimesMs.sort((a, b) => a - b);
  const times = candidateTimesMs.slice(0, 18).map((timeMs) => timeMs / 1000);
  return {
    times,
    window: {
      start_ms: Math.round(windowStartMs),
      end_ms: Math.round(windowEndMs),
      anchor_count: anchors.length
    }
  };
}

function inferBrowserPoseRows(samples) {
  const side = document.getElementById("dominantHand")?.value === "left" ? "left" : "right";
  return samples
    .map((sample) => browserPoseRow(sample, side))
    .filter(Boolean)
    .sort((a, b) => a.time_ms - b.time_ms);
}

function browserPoseRow(sample, side) {
  const landmarks = sample.landmarks || [];
  const point = (name) => landmarks[MEDIAPIPE_POSE[`${side}${name}`]];
  const shoulder = point("Shoulder");
  const elbow = point("Elbow");
  const wrist = point("Wrist");
  const hip = point("Hip");
  const knee = point("Knee");
  const ankle = point("Ankle");
  if (![shoulder, elbow, wrist, hip, knee, ankle].every(isVisiblePosePoint)) return null;
  const bodyHeight = Math.max(0.001, normalizedDistance(shoulder, ankle));
  return {
    time_ms: Number(sample.time_ms || 0),
    wrist_y: wrist.y,
    release_height_ratio: clampNumber((ankle.y - wrist.y) / bodyHeight, 0.2, 1.8),
    knee_angle_deg: poseAngle(hip, knee, ankle),
    elbow_angle_deg: poseAngle(shoulder, elbow, wrist)
  };
}

function inferBrowserShotPhase(rows) {
  const release = selectBrowserReleaseRow(rows);
  const shotWindowStartMs = Math.max(rows[0].time_ms, release.time_ms - 1600);
  const shotWindowEndMs = Math.min(rows.at(-1).time_ms, release.time_ms + 250);
  const preReleaseRows = rows.filter((row) => row.time_ms >= shotWindowStartMs && row.time_ms <= release.time_ms);
  const liftCandidates = preReleaseRows.filter((row) => row.time_ms >= release.time_ms - 1500);
  const liftStart = maxBy(liftCandidates.length ? liftCandidates : preReleaseRows, (row) => row.wrist_y);
  const lowerBodyRows = preReleaseRows.filter((row) =>
    row.time_ms >= liftStart.time_ms - 900 &&
    row.time_ms <= liftStart.time_ms + 180
  );
  const lowerBodyLoad = minBy(lowerBodyRows.length ? lowerBodyRows : preReleaseRows, (row) => row.knee_angle_deg);
  const wristTravel = liftStart.wrist_y - release.wrist_y;
  const pathRows = preReleaseRows.filter((row) => row.time_ms >= liftStart.time_ms && row.time_ms <= release.time_ms);
  const setPoint = wristTravel > 0.025
    ? pathRows.find((row) => row !== liftStart && row !== release && (liftStart.wrist_y - row.wrist_y) / wristTravel >= 0.7)
    : null;
  return { release, liftStart, lowerBodyLoad, setPoint, shotWindowStartMs, shotWindowEndMs };
}

function selectBrowserReleaseRow(rows) {
  if (rows.length <= 2) return minBy(rows, (row) => row.wrist_y);
  return maxBy(rows, (row, index) => {
    const previous = rows.filter((item) => item.time_ms < row.time_ms && item.time_ms >= row.time_ms - 1600);
    const priorLowWrist = previous.length ? Math.max(...previous.map((item) => item.wrist_y)) : row.wrist_y;
    const priorLowHeight = previous.length ? Math.min(...previous.map((item) => item.release_height_ratio)) : row.release_height_ratio;
    const wristRise = Math.max(0, priorLowWrist - row.wrist_y);
    const heightGain = Math.max(0, row.release_height_ratio - priorLowHeight);
    const lateBias = rows.length > 1 ? index / (rows.length - 1) : 0;
    return wristRise * 3.2 + heightGain * 2.4 + clampNumber(row.elbow_angle_deg / 180, 0, 1) * 0.28 + lateBias * 0.18;
  });
}

function isVisiblePosePoint(point) {
  return Boolean(point) &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number(point.visibility ?? point.presence ?? 0.8) >= 0.35;
}

function normalizedDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function poseAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return Math.acos(clampNumber(dot / Math.max(mag, 0.000001), -1, 1)) * 180 / Math.PI;
}

function clampNumber(value, min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
}

function isNearExistingTime(timeMs, existingTimes, pendingTimes) {
  const rounded = Math.round(timeMs);
  for (const value of existingTimes) {
    if (Math.abs(value - rounded) < 45) return true;
  }
  return pendingTimes.some((value) => Math.abs(value - rounded) < 45);
}

function renderDefaultMetrics() {
  const metrics = [
    ["起球/手腕-下肢时序差", "待分析", "候选", "blue"],
    ["躯干前倾", "待分析", "候选", "blue"],
    ["膝关节角度", "待分析", "参考", "green"],
    ["肘关节角度", "待分析", "参考", "green"],
    ["释放高度", "待分析", "参考", "green"],
    ["肩肘腕顺线", "待分析", "参考", "green"],
    ["手腕路径点", "待分析", "参考", "green"]
  ];
  renderMetricRows(metrics);

  document.getElementById("ruleMatches").innerHTML = [
    ["信号库", "等待证据"],
    ["知识库规则", "等待匹配"],
    ["教练报告", "等待校验"]
  ].map(([name, score]) => `<div class="rule-row"><span>${name}</span><strong>${score}</strong></div>`).join("");
}

function renderDefaultKeyframes() {
  renderKeyframes([
    { frame: 70, label: "准备" },
    { frame: 98, label: "下蹲最低点" },
    { frame: 128, label: "举球到位" },
    { frame: 142, label: "出手点" },
    { frame: 180, label: "落地" }
  ], 60, { phaseOverlay: false });
}

function renderDefaultCharts() {
  renderCharts([
    { name: "膝关节角度", key: "knee_angle_deg", tone: "green" },
    { name: "肘关节角度", key: "elbow_angle_deg", tone: "green" },
    { name: "躯干前倾", key: "trunk_lean_deg", tone: "red" },
    { name: "球高度", key: "ball_height_ratio", tone: "blue" }
  ], [
    { knee_angle_deg: 142, elbow_angle_deg: 74, trunk_lean_deg: 1.1, ball_height_ratio: 0.56 },
    { knee_angle_deg: 98, elbow_angle_deg: 78, trunk_lean_deg: 2.4, ball_height_ratio: 0.61 },
    { knee_angle_deg: 112, elbow_angle_deg: 88, trunk_lean_deg: 3.2, ball_height_ratio: 0.91 },
    { knee_angle_deg: 166, elbow_angle_deg: 92, trunk_lean_deg: 5.4, ball_height_ratio: 1.13 }
  ]);
}

function renderEvidence(evidence) {
  const m = evidence.metrics;
  state.precisionPose = evidence.model_outputs?.precision_pose || null;
  state.releaseMotion = evidence.release_motion || null;
  const lowEvidence = evidence.confidence.max_report_confidence === "low";
  const releaseMotion = evidence.release_motion || {};
  renderMetricRows([
    ["起球/手腕-下肢时序差", `${m.ball_lift_knee_delta_ms} ms`, lowEvidence ? "待复核" : (m.ball_lift_knee_delta_ms > 120 ? "风险" : "观察"), lowEvidence ? "blue" : "red"],
    ["躯干前倾", `${m.trunk_lean_release_deg}°`, lowEvidence ? "待复核" : (m.trunk_lean_release_deg > 5 ? "风险" : "观察"), lowEvidence ? "blue" : "red"],
    ["膝关节角度（最低）", `${m.knee_angle_min_deg}°`, "参考", "green"],
    ["肘关节角度（出手时）", `${m.elbow_angle_release_deg}°`, "参考", "green"],
    ["释放高度比", `${m.release_height_ratio}`, "参考", "green"],
    ["肩肘腕顺线误差", Number.isFinite(m.shoulder_elbow_wrist_alignment_error_deg) ? `${m.shoulder_elbow_wrist_alignment_error_deg}°` : "待姿态", "参考", "green"],
    ["手腕路径点", `${releaseMotion.wrist_path?.length || 0}`, releaseMotion.status || "待分析", "blue"]
  ]);

  document.getElementById("confidenceScore").textContent = `${Math.round(evidence.confidence.overall * 100)}%`;
  document.getElementById("sessionMeta").textContent =
    `视角：${evidence.session.camera_view} / ${evidence.session.fps}fps / ${evidence.session.analysis_mode}`;
  document.getElementById("qualityBadge").textContent = confidenceLabel(evidence.confidence.max_report_confidence);

  renderCoachReasons(evidence);
  renderRuleMatches(evidence);
  renderPipelineStatus(evidence);
  renderReleaseMotion(evidence.release_motion);
  renderKeyframes(seriesToKeyframes(evidence.metric_series, evidence.release_motion), evidence.session.fps, { phaseOverlay: true });
  drawPrecisionPoseAtTime(document.getElementById("shotVideo").currentTime * 1000);
  renderCharts([
    { name: "膝关节角度", key: "knee_angle_deg", tone: "green" },
    { name: "肘关节角度", key: "elbow_angle_deg", tone: "green" },
    { name: "躯干前倾", key: "trunk_lean_deg", tone: "red" },
    { name: "球高度", key: "ball_height_ratio", tone: "blue" }
  ], evidence.metric_series);
}

function renderReleaseMotion(releaseMotion) {
  const statusEl = document.getElementById("releaseMotionStatus");
  const cardEl = document.getElementById("releaseMotionCard");
  if (!statusEl || !cardEl) return;
  if (!releaseMotion) {
    statusEl.textContent = "未生成";
    cardEl.innerHTML = `<p class="muted">本次 evidence packet 没有 release_motion 字段；只画起球到出手手腕路径和 release 标记，不追踪空中球路，不直接支撑动作诊断。human_pose_motion_slice_only_no_airborne_ball_tracking</p>`;
    return;
  }
  statusEl.textContent = releaseMotionStatusLabel(releaseMotion.status);
  const missing = releaseMotion.missing_evidence || [];
  const path = releaseMotion.wrist_path || [];
  const metrics = releaseMotion.metrics || {};
  const phases = releaseMotion.phase_frames || {};
  cardEl.innerHTML = `
    <div class="report-meta">
      <span>出手动作切片</span>
      <span>${Math.round(Number(releaseMotion.confidence || 0) * 100)}%</span>
      <span>${path.length} 个手腕路径点</span>
    </div>
    <div class="report-evidence">
      <div><span>投篮窗口</span><strong>${frameLabel(phases.shot_window_start)} - ${frameLabel(phases.shot_window_end)}</strong><small>先锁定出手窗口，再找阶段</small></div>
      <div><span>下蹲最低点</span><strong>${frameLabel(phases.lower_body_load)}</strong><small>只在投篮窗口附近寻找，避免运球阶段污染</small></div>
      <div><span>起球开始</span><strong>${frameLabel(phases.lift_start)}</strong><small>以投篮手手腕上升估算</small></div>
      <div><span>举球到位</span><strong>${frameLabel(phases.set_point)}</strong><small>没有独立关键点时不硬标</small></div>
      <div><span>出手附近</span><strong>${frameLabel(phases.release)}</strong><small>以投篮手手腕最高点估算</small></div>
      <div><span>起球/下肢时序</span><strong>${Number.isFinite(Number(metrics.lift_lower_body_delta_ms)) ? `${metrics.lift_lower_body_delta_ms} ms` : "暂无"}</strong><small>用于候选判断，不单独定性</small></div>
      <div><span>躯干前倾</span><strong>${Number.isFinite(Number(metrics.trunk_lean_release_deg)) ? `${metrics.trunk_lean_release_deg}°` : "暂无"}</strong><small>出手附近姿态参考</small></div>
      <div><span>肩肘腕顺线误差</span><strong>${Number.isFinite(Number(metrics.shoulder_elbow_wrist_alignment_error_deg)) ? `${metrics.shoulder_elbow_wrist_alignment_error_deg}°` : "n/a"}</strong><small>只作姿态参考</small></div>
    </div>
    <h4>切片结论</h4>
    <p class="muted">${escapeHtml(releaseMotion.summary?.timing || "等待姿态证据。")}</p>
    <p class="muted">${escapeHtml(releaseMotion.summary?.posture || "等待姿态证据。")}</p>
    <p class="warning">${escapeHtml(releaseMotion.summary?.release || "该切片不判断空中球路或命中结果。")} 只画起球到出手手腕路径和 release 标记，不追踪空中球路，不直接支撑动作诊断。human_pose_motion_slice_only_no_airborne_ball_tracking</p>
    ${missing.length ? `<details class="lab-details compact-details"><summary>查看缺失或低置信证据</summary>${missing.map((item) => `<p class="warning">${escapeHtml(missingReasonLabel(item.reason))}：${escapeHtml(item.message)}</p>`).join("")}</details>` : ""}
  `;
}

function frameLabel(frame) {
  if (!frame) return "n/a";
  const parts = [];
  if (Number.isFinite(Number(frame.frame))) parts.push(`F${Number(frame.frame)}`);
  if (Number.isFinite(Number(frame.time_ms))) parts.push(`${Number(frame.time_ms)}ms`);
  return parts.join(" / ") || "n/a";
}

function renderMultiAnglePending() {
  const statusEl = document.getElementById("multiAngleStatus");
  const cardEl = document.getElementById("multiAngleCard");
  if (!statusEl || !cardEl) return;
  if (state.pairedUpload?.upload_id) {
    statusEl.textContent = "已上传";
    cardEl.innerHTML = `<p class="muted">补充视角已上传。点击分析后会生成多角度合并证据。</p>`;
    return;
  }
  statusEl.textContent = "单视角";
  cardEl.innerHTML = `<p class="muted">上传补充视角后，会生成 front + side 合并证据。</p>`;
}

function renderMultiAngleEvidence(packet) {
  const statusEl = document.getElementById("multiAngleStatus");
  const cardEl = document.getElementById("multiAngleCard");
  if (!statusEl || !cardEl) return;
  if (!packet) {
    renderMultiAnglePending();
    return;
  }
  statusEl.textContent = packet.schema_version || "multi_angle_evidence_packet.v1";
  const merged = packet.merged || {};
  const missingViews = packet.missing_views || [];
  const metricViews = [...new Set((merged.metrics || []).map((metric) => metric.source_view).filter(Boolean))];
  const signalViews = [...new Set((merged.matched_signals || []).map((signal) => signal.source_view).filter(Boolean))];
  const ruleViews = [...new Set((merged.matched_rules || []).flatMap((rule) => rule.source_views || []))];
  cardEl.innerHTML = `
    <div class="report-meta">
      <span>${escapeHtml(packet.present_views.join(" + ") || "unknown")}</span>
      <span>${escapeHtml(merged.confidence?.max_report_confidence || "low")}</span>
      <span>${merged.metrics?.length || 0} metrics</span>
    </div>
    <div class="report-evidence">
      <div><span>Session Group</span><strong>${escapeHtml(packet.session_group_id)}</strong><small>${escapeHtml(packet.sync_policy)}</small></div>
      <div><span>Metric Views</span><strong>${escapeHtml(metricViews.join(", ") || "none")}</strong><small>每个 metric 保留 source_view</small></div>
      <div><span>Signal Views</span><strong>${escapeHtml(signalViews.join(", ") || "none")}</strong><small>规则会继承 supporting signal 的视角</small></div>
      <div><span>Rule Views</span><strong>${escapeHtml(ruleViews.join(", ") || "none")}</strong><small>matched rules 保留 source_views</small></div>
    </div>
    ${renderMultiAngleSyncAssessment(packet.sync_assessment)}
    ${renderMultiAngleViewQuality(packet.view_quality_assessment)}
    ${renderMultiAngleViewTable(packet)}
    ${renderMultiAngleMetricAudit(merged.metrics || [])}
    ${renderMultiAngleMissingEvidence(merged.missing_evidence || [])}
    ${missingViews.length ? `<h4>缺失视角</h4>${missingViews.map((view) => `<p class="warning">${escapeHtml(view)} 视角缺失，相关结论会降级。</p>`).join("")}` : `<p class="muted">front + side 已进入同一 session group；仍未做精确关键帧同步。</p>`}
  `;
}

function renderMultiAngleViewQuality(quality) {
  if (!quality) return "";
  const risks = quality.risk_factors || [];
  const rows = (quality.view_results || []).slice(0, 4).map((item) => `
    <div class="multi-angle-row">
      <strong>${escapeHtml(item.view)}</strong>
      <span>${escapeHtml(item.status)}</span>
      <span>${escapeHtml(item.fps ? `${Number(item.fps).toFixed(1)}fps` : "fps n/a")}</span>
      <em>${escapeHtml(item.source_contract || "metadata_only")}</em>
    </div>
  `).join("");
  return `
    <h4>视角质量评估</h4>
    <div class="multi-angle-table">
      <div class="multi-angle-row">
        <strong>${escapeHtml(quality.schema_version || "view_quality_assessment.v1")}</strong>
        <span>${escapeHtml(quality.status || "unknown")}</span>
        <span>${quality.ready_sample_count || quality.view_results?.length || 0} inputs</span>
        <em>${escapeHtml(quality.source_contract || "metadata_and_evidence_context_only_not_real_frame_quality")}</em>
      </div>
      ${rows}
      ${risks.slice(0, 5).map((risk) => `
        <div class="multi-angle-row">
          <strong>${escapeHtml(risk.factor_id)}</strong>
          <span>${escapeHtml(risk.severity)}</span>
          <em>${escapeHtml(risk.user_impact)}</em>
        </div>
      `).join("")}
    </div>
    <p class="muted">${escapeHtml(quality.retake_guidance || "metadata 只证明输入合同，不证明真实画面质量。")}</p>
  `;
}

function renderMultiAngleSyncAssessment(sync) {
  if (!sync) return "";
  const reasons = sync.reasons || [];
  return `
    <h4>同步评估</h4>
    <div class="multi-angle-table">
      <div class="multi-angle-row">
        <strong>${escapeHtml(sync.schema_version || "sync_assessment.v1")}</strong>
        <span>${escapeHtml(sync.status || "unknown")}</span>
        <span>${escapeHtml(sync.precision || "not_frame_accurate")}</span>
        <em>${escapeHtml(sync.policy || "approximate_session_grouping_no_manual_keyframe_sync")}</em>
      </div>
      ${reasons.slice(0, 5).map((item) => `
        <div class="multi-angle-row">
          <strong>${escapeHtml(item.reason)}</strong>
          <span>${escapeHtml(item.impact)}</span>
        </div>
      `).join("")}
    </div>
    ${renderMultiAngleSyncRisks(sync)}
    <p class="muted">同步评估只说明当前合并精度；不是精确跨机位同步。</p>
  `;
}

function renderMultiAngleSyncRisks(sync) {
  const risks = sync.risk_factors || [];
  if (!risks.length) return "";
  return `
    <h4>同步风险</h4>
    <div class="multi-angle-table">
      <div class="multi-angle-row">
        <strong>${escapeHtml(sync.risk_level || "unknown")}</strong>
        <span>${escapeHtml(sync.retake_guidance || "下一次加入同步标记。")}</span>
      </div>
      ${risks.slice(0, 5).map((risk) => `
        <div class="multi-angle-row">
          <strong>${escapeHtml(risk.factor_id)}</strong>
          <span>${escapeHtml(risk.severity)}</span>
          <em>${escapeHtml(risk.user_impact)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMultiAngleViewTable(packet) {
  const views = packet.views || {};
  const presentViews = packet.present_views || [];
  if (!presentViews.length) return "";
  const rows = presentViews.map((view) => {
    const evidence = views[view] || {};
    const metrics = Object.keys(evidence.metrics || {}).length;
    const signals = (evidence.matched_signals || []).length;
    const missing = (evidence.missing_evidence || []).length;
    const confidence = evidence.confidence?.max_report_confidence || "low";
    const mode = evidence.session?.analysis_mode || "unknown";
    return `
      <div class="multi-angle-row">
        <strong>${escapeHtml(view)}</strong>
        <span>${metrics} metrics</span>
        <span>${signals} signals</span>
        <span>${missing} missing</span>
        <em>${escapeHtml(confidence)} · ${escapeHtml(mode)}</em>
      </div>
    `;
  }).join("");
  return `
    <h4>视角证据清单</h4>
    <div class="multi-angle-table">${rows}</div>
    <p class="muted">当前仅做 approximate session grouping；没有精确关键帧同步。</p>
  `;
}

function renderMultiAngleMetricAudit(metrics) {
  const priority = ["ball_lift_knee_delta_ms", "trunk_lean_release_deg", "knee_angle_min_deg", "elbow_angle_release_deg", "ball_path_offset_cm"];
  const selected = metrics
    .filter((metric) => priority.includes(metric.metric_id))
    .slice(0, 10);
  if (!selected.length) return "";
  return `
    <h4>关键指标来源</h4>
    <div class="multi-angle-table">
      ${selected.map((metric) => `
        <div class="multi-angle-row">
          <strong>${escapeHtml(metric.metric_id)}</strong>
          <span>${escapeHtml(metric.source_view || "unknown")}</span>
          <span>${formatAuditValue(metric.value)}</span>
          <em>${escapeHtml(metric.source_layer || "unknown")}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMultiAngleMissingEvidence(missingEvidence) {
  const viewMissing = missingEvidence.filter((item) => item.type === "view");
  if (!viewMissing.length) return "";
  return `
    <h4>视角缺失影响</h4>
    ${viewMissing.map((item) => `<p class="warning">${escapeHtml(item.value)}：${escapeHtml(item.impact)}</p>`).join("")}
  `;
}

function formatAuditValue(value) {
  if (Number.isFinite(Number(value))) return Number(value).toFixed(2);
  if (value === null || value === undefined) return "n/a";
  return escapeHtml(value);
}

function renderCoachReasons(evidence) {
  const reasons = (evidence.missing_evidence || []).slice(0, 3).map((item) => item.impact);
  const degradation = (evidence.confidence?.degradation_reasons || []).slice(0, Math.max(0, 3 - reasons.length))
    .map((reason) => degradationLabel(reason));
  const rows = [...reasons, ...degradation].filter(Boolean);
  document.getElementById("coachReasons").innerHTML = `
    <div class="section-title">为什么这样判断 <span>${confidenceLabel(evidence.confidence.max_report_confidence)}</span></div>
    ${rows.length
      ? rows.map((reason) => `<p>${escapeHtml(reason)}</p>`).join("")
      : `<p>当前证据满足基础判断条件。</p>`}
  `;
}

function degradationLabel(reason) {
  return {
    frame_rate_below_60fps: "帧率低于 60fps，出手瞬间和时序判断误差会变大。",
    low_pose_confidence: "姿态关键点置信度偏低，角度指标只能作为复核参考。",
    low_ball_tracking_confidence: "篮球轨迹识别置信度偏低，球路和出手角需要降级。",
    object_detection_not_available: "篮球或篮筐未可靠识别，不能稳定判断球路。",
    shot_event_insufficient_evidence: "已运行球/筐识别，但未捕捉到完整过筐序列，命中判断需要复测或人工反馈。",
    missing_required_view_or_context: "当前视角不满足部分动作规则的 required_view。",
    some_signals_not_judgable: "部分信号因视角或证据缺失不能判断。",
    some_signals_low_confidence: "部分信号置信度不足，只能作为候选复核点。"
  }[reason] || reason;
}

function shotEventLabel(metrics = {}) {
  const attempts = Number(metrics.shot_attempts || 0);
  const made = Number(metrics.shot_makes || 0);
  const missed = Number(metrics.shot_misses || 0);
  if (!attempts && metrics.shot_result === "undetermined") return "候选轨迹";
  if (!attempts) return "待 YOLO";
  return `${made} 命中 / ${missed} 未中`;
}

function shotEventTag(metrics = {}) {
  if (Number(metrics.shot_event_confidence || 0) >= 0.6) return "YOLO";
  if (metrics.shot_result === "undetermined") return "候选";
  return "待复核";
}

function renderMetricRows(rows) {
  document.getElementById("metricList").innerHTML = rows.map(([label, value, tag, tone]) => `
    <div class="metric-row">
      <span>${label}</span>
      <strong>${value}</strong>
      <em class="${tone}">${tag}</em>
      <div class="range ${tone}"><i style="left: ${tone === "red" ? 72 : 62}%"></i></div>
    </div>
  `).join("");
}

function renderRuleMatches(evidence) {
  const rows = evidence.matched_rules.map((rule) => `
    <div class="rule-row">
      <span>${rule.title}</span>
      <strong>${ruleStatusLabel(rule.status)}</strong>
    </div>
  `);
  const signalRows = evidence.matched_signals.map((signal) => `
    <div class="signal-row ${signal.status === "not_judgable" ? "blocked" : ""}">
      <strong>${signal.name}</strong>
      <span>${signalStatusLabel(signal.status)} · ${Math.round(signal.confidence * 100)}% · ${signal.value_label}</span>
    </div>
  `);
  document.getElementById("ruleMatches").innerHTML = [...rows, ...signalRows].join("");
}

function renderPipelineStatus(evidence) {
  const modelOutputs = evidence.model_outputs || {};
  const health = modelOutputs.health || state.modelHealth || {};
  const statuses = [
    ["视频输入", evidence.pipeline_status.video_layer],
    ["MediaPipe", modelOutputs.fast_pose?.status || evidence.pipeline_status.fast_pose_layer],
    ["YOLO", modelOutputs.object_detection?.status || evidence.pipeline_status.object_detection_layer],
    ["投篮事件", evidence.pipeline_status.shot_event_layer || "not_available"],
    ["RTMPose", modelOutputs.precision_pose?.status || evidence.pipeline_status.precision_layer],
    ["动作指标", evidence.pipeline_status.metric_layer],
    ["训练记忆", evidence.pipeline_status.memory_layer]
  ];
  document.getElementById("pipelineStatus").innerHTML = statuses.map(([label, value]) => `
    <div><span>${label}</span><strong>${pipelineStatusLabel(value)}</strong></div>
  `).join("") + renderHealthRows(health) + [
    modelOutputs.fast_pose?.diagnostics ? `<p class="muted">MediaPipe：尝试 ${modelOutputs.fast_pose.diagnostics.samples_attempted || 0} 帧，检测到 ${modelOutputs.fast_pose.diagnostics.samples_detected || 0} 帧，补采 ${modelOutputs.fast_pose.diagnostics.supplemental_samples_detected || 0} 帧，原因 ${escapeHtml(missingReasonLabel(modelOutputs.fast_pose.diagnostics.failure_reason || "none"))}</p>` : "",
    modelOutputs.precision_pose?.sampling_policy ? `<p class="muted">RTMPose：${escapeHtml(modelOutputs.precision_pose.sampling_policy)} · ${modelOutputs.precision_pose.pose_series?.length || 0}/${modelOutputs.precision_pose.frame_count || "?"} 帧</p>` : "",
    modelOutputs.object_detection?.error ? `<p class="warning">YOLO adapter: ${escapeHtml(modelOutputs.object_detection.error)}</p>` : "",
    modelOutputs.precision_pose?.error ? `<p class="warning">RTMPose adapter: ${escapeHtml(modelOutputs.precision_pose.error)}</p>` : ""
  ].join("");

  const missing = evidence.missing_evidence || [];
  document.getElementById("missingEvidence").innerHTML = missing.length
    ? missing.map((item) => `<p class="warning">${missingTypeLabel(item.type)}：需要 ${escapeHtml(item.value)}。${escapeHtml(item.impact)}</p>`).join("")
    : `<p class="muted">当前 evidence 没有触发必要降级项。</p>`;
}

async function loadModelHealth() {
  const health = await fetch("/api/model-health").then((res) => res.json()).catch((error) => ({
    yolo: { engine: "YOLO", ok: false, status: "health_request_failed", error: error.message, missing: ["health_api"] },
    rtmpose: { engine: "RTMPose/MMPose", ok: false, status: "health_request_failed", error: error.message, missing: ["health_api"] }
  }));
  state.modelHealth = health;
  if (!state.evidencePacket) {
    document.getElementById("pipelineStatus").innerHTML = renderHealthRows(health);
  }
}

function renderHealthRows(health = {}) {
  const entries = Object.entries(health);
  if (!entries.length) return "";
  return `
    <div class="health-group">
      ${entries.map(([name, item]) => `
        <div class="${item.ok ? "ok" : "warning-row"}">
          <span>${escapeHtml(item.engine || name)}</span>
          <strong>${escapeHtml(pipelineStatusLabel(item.status || "unknown"))}</strong>
          <small>${healthDetails(item)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function healthDetails(item = {}) {
  const missing = item.missing?.length ? `缺失：${item.missing.join(", ")}` : "";
  const weights = item.weights ? Object.entries(item.weights)
    .map(([key, value]) => `${key}:${value.exists ? "local" : value.source || "n/a"}`)
    .join(" / ") : "";
  return escapeHtml([missing, weights, item.error].filter(Boolean).join(" · ") || "依赖检测通过");
}

function renderKeyframes(frames, fps, options = {}) {
  const video = document.getElementById("shotVideo");
  state.phaseKeyframes = options.phaseOverlay
    ? frames.map((item) => ({
      ...item,
      time_ms: Math.round((Number(item.frame || 0) / Math.max(1, Number(fps || 60))) * 1000)
    }))
    : [];
  document.getElementById("keyframes").innerHTML = frames.map((item, index) => `
    <button class="keyframe ${item.label === "出手点" || (!frames.some((frame) => frame.label === "出手点") && index === 3) ? "selected" : ""}" data-time="${item.frame / fps}">
      <span></span>
      <strong>Frame ${item.frame}</strong>
      <em>${item.label}</em>
    </button>
  `).join("");

  document.querySelectorAll(".keyframe").forEach((button) => {
    button.addEventListener("click", () => {
      if (!video.src) return;
      video.currentTime = Number(button.dataset.time);
      drawPrecisionPoseAtTime(Number(button.dataset.time) * 1000);
      document.querySelectorAll(".keyframe").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
}

function drawPrecisionPoseAtTime(timeMs) {
  const video = document.getElementById("shotVideo");
  const canvas = document.getElementById("poseCanvas");
  const pose = state.precisionPose;
  if (!video.videoWidth) return;
  sizePoseCanvas(video, canvas);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!pose?.pose_series?.length) {
    const releaseCount = drawReleaseMotionOverlay(ctx, canvas, state.releaseMotion, timeMs);
    renderOverlayDiagnostics({
      status: releaseCount ? "release_motion_only" : "no_pose",
      pose_source: "none",
      line_count: 0,
      phase: null,
      release_count: releaseCount,
      guard_reason: "no_precision_pose_series"
    });
    if (releaseCount) {
      setPoseStatus(`已显示 ${releaseCount} 个出手切片点；当前没有可用人体关键点，不绘制静态骨架。`);
    }
    return;
  }
  const frame = nearestPoseFrame(pose.pose_series, timeMs);
  if (!frame?.keypoints?.length) {
    const releaseCount = drawReleaseMotionOverlay(ctx, canvas, state.releaseMotion, timeMs);
    renderOverlayDiagnostics({
      status: "no_keypoints",
      pose_source: "rtmpose_precision_pose",
      line_count: 0,
      phase: null,
      release_count: releaseCount,
      guard_reason: "missing_keypoints"
    });
    return;
  }
  const scaleX = canvas.width / Math.max(1, Number(pose.image_width || video.videoWidth));
  const scaleY = canvas.height / Math.max(1, Number(pose.image_height || video.videoHeight));
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#68f07a";
  for (const [a, b] of COCO_CONNECTIONS) {
    const pa = frame.keypoints[a];
    const pb = frame.keypoints[b];
    if (!Array.isArray(pa) || !Array.isArray(pb)) continue;
    ctx.beginPath();
    ctx.moveTo(pa[0] * scaleX, pa[1] * scaleY);
    ctx.lineTo(pb[0] * scaleX, pb[1] * scaleY);
    ctx.stroke();
  }
  ctx.fillStyle = "#d7ffe0";
  for (const point of frame.keypoints) {
    if (!Array.isArray(point)) continue;
    ctx.beginPath();
    ctx.arc(point[0] * scaleX, point[1] * scaleY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const lineCount = drawPrecisionCoachLines(ctx, frame.keypoints, scaleX, scaleY);
  const phase = drawPhaseLabel(ctx, canvas, timeMs);
  const releaseCount = drawReleaseMotionOverlay(ctx, canvas, state.releaseMotion, timeMs);
  renderOverlayDiagnostics({
    status: "rtmpose_precision_pose",
    pose_source: "rtmpose_precision_pose",
    line_count: lineCount,
    phase,
    release_count: releaseCount,
    guard_reason: lineCount ? "ok" : "score<0.2_or_missing_keypoints"
  });
  setPoseStatus(lineCount
    ? `已显示 RTMPose 骨架和 ${lineCount} 条教练线；全部来自后端关键点${phase ? `，阶段：${phase.label}` : ""}${releaseCount ? `；叠加 ${releaseCount} 个出手切片点` : ""}。`
    : `已显示 RTMPose 骨架；关键点不足时不绘制教练线${releaseCount ? `，已叠加 ${releaseCount} 个出手切片点` : ""}。`);
}

function exportAnnotatedFrame(options = {}) {
  const { download = true, includeDataUrl = download } = options;
  const video = document.getElementById("shotVideo");
  const overlay = document.getElementById("poseCanvas");
  if (!video?.src || !video.videoWidth || !video.videoHeight) {
    throw new Error("当前没有可导出的视频帧。");
  }
  sizePoseCanvas(video, overlay);
  drawPrecisionPoseAtTime(video.currentTime * 1000);

  const width = Math.max(1, overlay.width || video.videoWidth);
  const height = Math.max(1, overlay.height || video.videoHeight);
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const ctx = frame.getContext("2d");
  ctx.fillStyle = "#020405";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);
  ctx.drawImage(overlay, 0, 0, width, height);

  const dataUrl = frame.toDataURL("image/png");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (download) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `shooting-lab-annotated-frame-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  return {
    schema_version: "annotated_frame_export.v1",
    source_contract: "local_browser_png_current_frame_no_video_export",
    width,
    height,
    time_ms: Math.round(video.currentTime * 1000),
    includes_video_frame: true,
    includes_overlay_canvas: true,
    download_triggered: Boolean(download),
    data_url_prefix: dataUrl.slice(0, 22),
    data_url_length: dataUrl.length,
    ...(includeDataUrl ? { data_url: dataUrl } : {})
  };
}

function nearestPoseFrame(series, timeMs) {
  return series.reduce((best, item) => {
    if (!best) return item;
    return Math.abs(Number(item.time_ms || 0) - timeMs) < Math.abs(Number(best.time_ms || 0) - timeMs) ? item : best;
  }, null);
}

function drawReleaseMotionOverlay(ctx, canvas, releaseMotion, timeMs) {
  const points = (releaseMotion?.wrist_path || []).filter(validReleaseMotionPoint);
  if (!points.length) return 0;
  const mappedPoints = points.map((point) => ({
    x: Number(point.x) * canvas.width,
    y: Number(point.y) * canvas.height,
    confidence: point.confidence,
    frame: point.frame,
    time_ms: point.time_ms
  }));
  const color = releaseMotionColor(releaseMotion.confidence);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  mappedPoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  for (const point of mappedPoints) {
    ctx.fillStyle = releaseMotionColor(point.confidence);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const releaseFrame = releaseMotion.phase_frames?.release?.frame;
  const releasePoint = findMotionPoint(mappedPoints, releaseFrame);
  if (releasePoint) drawReleaseMotionMarker(ctx, releasePoint, "出手", "#facc15");
  const current = nearestReleaseMotionPoint(mappedPoints, timeMs);
  if (current) drawReleaseMotionMarker(ctx, current, "当前", "#ffffff");
  drawReleaseMotionOverlayLabel(ctx, canvas, releaseMotion);
  ctx.restore();
  return points.length;
}

function validReleaseMotionPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

function releaseMotionColor(confidence) {
  const value = Number(confidence || 0);
  if (value >= 0.7) return "#22d3ee";
  if (value >= 0.45) return "#facc15";
  return "rgba(203, 213, 225, 0.78)";
}

function findMotionPoint(points, frame) {
  if (!Number.isFinite(Number(frame))) return null;
  return points.find((point) => Number(point.frame) === Number(frame)) || null;
}

function nearestReleaseMotionPoint(points, timeMs) {
  if (!Number.isFinite(Number(timeMs))) return null;
  return points.reduce((best, point) => {
    if (!Number.isFinite(Number(point.time_ms))) return best;
    if (!best) return point;
    return Math.abs(Number(point.time_ms) - timeMs) < Math.abs(Number(best.time_ms) - timeMs) ? point : best;
  }, null);
}

function drawReleaseMotionMarker(ctx, point, label, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawOverlayText(ctx, label, point.x + 10, point.y - 8, color);
}

function drawReleaseMotionOverlayLabel(ctx, canvas, releaseMotion) {
  const text = `出手切片 ${releaseMotion.status || "candidate"} · ${Math.round(Number(releaseMotion.confidence || 0) * 100)}%`;
  ctx.save();
  ctx.font = "13px Arial, sans-serif";
  const width = Math.ceil(ctx.measureText(text).width + 20);
  const x = 14;
  const y = canvas.height - 54;
  ctx.fillStyle = "rgba(4, 13, 18, 0.82)";
  ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, 30, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#a5f3fc";
  ctx.fillText(text, x + 10, y + 20);
  ctx.restore();
}

function drawOverlayText(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "12px Arial, sans-serif";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBrowserCoachLines(ctx, landmarks, canvas) {
  const point = (name) => normalizedPoint(landmarks[MEDIAPIPE_POSE[name]], canvas);
  return drawCoachLines(ctx, point);
}

function drawPrecisionCoachLines(ctx, keypoints, scaleX, scaleY) {
  const point = (name) => pixelPoint(keypoints[COCO_POSE[name]], scaleX, scaleY);
  return drawCoachLines(ctx, point);
}

function drawCoachLines(ctx, point) {
  const hand = document.getElementById("dominantHand")?.value === "left" ? "left" : "right";
  const offHand = hand === "left" ? "right" : "left";
  const chainSide = hand;
  const lines = [
    {
      label: "脚膝髋力线",
      color: "#22d3ee",
      points: [point(`${chainSide}Ankle`), point(`${chainSide}Knee`), point(`${chainSide}Hip`)]
    },
    {
      label: "肩肘腕线",
      color: "#facc15",
      points: [point(`${hand}Shoulder`), point(`${hand}Elbow`), point(`${hand}Wrist`)]
    },
    {
      label: "辅助手线",
      color: "#a78bfa",
      points: [point(`${offHand}Shoulder`), point(`${offHand}Elbow`), point(`${offHand}Wrist`)]
    },
    {
      label: "发力链线",
      color: "#fb7185",
      points: [
        point(`${chainSide}Ankle`),
        point(`${chainSide}Knee`),
        point(`${chainSide}Hip`),
        point(`${hand}Shoulder`),
        point(`${hand}Elbow`),
        point(`${hand}Wrist`)
      ]
    },
    {
      label: "躯干线",
      color: "#ffffff",
      points: [
        midpoint(point("leftHip"), point("rightHip")),
        midpoint(point("leftShoulder"), point("rightShoulder"))
      ]
    }
  ];

  let count = 0;
  for (const line of lines) {
    const valid = line.points.filter(Boolean);
    if (valid.length < 2 || valid.length !== line.points.length) continue;
    drawPolyline(ctx, valid, line.color);
    drawLineLabel(ctx, line.label, valid.at(-1), line.color);
    count += 1;
  }

  const leftHipMid = midpoint(point("leftHip"), point("rightHip"));
  const leftShoulderMid = midpoint(point("leftShoulder"), point("rightShoulder"));
  const angles = [
    {
      label: "膝角",
      color: "#38bdf8",
      points: [point(`${chainSide}Ankle`), point(`${chainSide}Knee`), point(`${chainSide}Hip`)]
    },
    {
      label: "髋角",
      color: "#34d399",
      points: [point(`${chainSide}Knee`), point(`${chainSide}Hip`), point(`${hand}Shoulder`)]
    },
    {
      label: "肘角",
      color: "#fbbf24",
      points: [point(`${hand}Shoulder`), point(`${hand}Elbow`), point(`${hand}Wrist`)]
    },
    {
      label: "躯干角",
      color: "#f472b6",
      points: [
        leftShoulderMid,
        leftHipMid,
        leftHipMid ? { x: leftHipMid.x, y: leftHipMid.y - 72 } : null
      ]
    }
  ];

  for (const angle of angles) {
    if (angle.points.some((item) => !item)) continue;
    drawAngleArc(ctx, angle.points[0], angle.points[1], angle.points[2], angle.label, angle.color);
    count += 1;
  }
  return count;
}

function normalizedPoint(point, canvas) {
  if (!point) return null;
  const visibility = point.visibility ?? point.presence ?? 1;
  if (visibility < 0.5 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    x: point.x * canvas.width,
    y: point.y * canvas.height
  };
}

function pixelPoint(point, scaleX, scaleY) {
  if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  const score = point[2] ?? 1;
  if (score < 0.2) return null;
  return {
    x: point[0] * scaleX,
    y: point[1] * scaleY
  };
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function drawPolyline(ctx, points, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawLineLabel(ctx, label, point, color) {
  if (!point) return;
  ctx.save();
  ctx.font = "12px Arial, sans-serif";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = 4;
  ctx.strokeText(label, point.x + 6, point.y - 6);
  ctx.fillText(label, point.x + 6, point.y - 6);
  ctx.restore();
}

function drawAngleArc(ctx, a, vertex, c, label, color) {
  const start = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const end = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  const diff = normalizeRadians(end - start);
  const degrees = Math.round(Math.abs(diff) * 180 / Math.PI);
  const radius = Math.max(18, Math.min(34, distance(a, vertex) * 0.34, distance(c, vertex) * 0.34));
  const labelAngle = start + diff / 2;
  const labelPoint = {
    x: vertex.x + Math.cos(labelAngle) * (radius + 14),
    y: vertex.y + Math.sin(labelAngle) * (radius + 14)
  };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, start, start + diff, diff < 0);
  ctx.stroke();
  ctx.font = "12px Arial, sans-serif";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = 4;
  const text = `${label} ${degrees}°`;
  ctx.strokeText(text, labelPoint.x, labelPoint.y);
  ctx.fillText(text, labelPoint.x, labelPoint.y);
  ctx.restore();
}

function drawPhaseLabel(ctx, canvas, timeMs) {
  const phase = nearestPhaseKeyframe(timeMs);
  if (!phase) return null;
  const text = `阶段：${phase.label} · Frame ${phase.frame}`;
  ctx.save();
  ctx.font = "13px Arial, sans-serif";
  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width + 20);
  const x = 14;
  const y = 14;
  ctx.fillStyle = "rgba(4, 13, 18, 0.82)";
  ctx.strokeStyle = "rgba(32, 199, 243, 0.55)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, 30, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#bfefff";
  ctx.fillText(text, x + 10, y + 20);
  ctx.restore();
  return phase;
}

function nearestPhaseKeyframe(timeMs) {
  if (!state.phaseKeyframes?.length) return null;
  return state.phaseKeyframes.reduce((best, item) => {
    if (!best) return item;
    return Math.abs(Number(item.time_ms || 0) - timeMs) < Math.abs(Number(best.time_ms || 0) - timeMs) ? item : best;
  }, null);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function normalizeRadians(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function renderCharts(chartDefs, series) {
  document.getElementById("chartStrip").innerHTML = chartDefs.map((chart) => {
    const values = series.map((row) => Number(row[chart.key])).filter(Number.isFinite);
    const latest = values.at(-1);
    return `
      <div class="mini-chart">
        <div><span>${chart.name}</span><strong class="${chart.tone}">${formatMetricValue(chart.key, latest)}</strong></div>
        <svg viewBox="0 0 260 100">
          <path class="${chart.tone}" d="${linePath(values)}" />
          <line x1="148" y1="5" x2="148" y2="94" />
          <circle cx="148" cy="50" r="7" />
        </svg>
      </div>
    `;
  }).join("");
}

async function loadKnowledge() {
  const summary = await fetch("/api/knowledge-summary").then((res) => res.json()).catch(() => null);
  if (!summary) {
    document.getElementById("knowledgeSummary").innerHTML = `<p class="warning">知识库摘要加载失败。</p>`;
    return;
  }
  document.getElementById("kbVersion").textContent = `v${summary.version}`;
  document.getElementById("knowledgeSummary").innerHTML = `
    <div class="kb-grid">
      <strong>${summary.cards}</strong><span>规则卡</span>
      <strong>${summary.diagnosis_rule_count}</strong><span>诊断规则</span>
      <strong>${summary.signal_count}</strong><span>研究信号</span>
    </div>
    <div class="signal-list">
      ${summary.featured_signals.map((signal) => `<span>${signal.name}</span>`).join("")}
    </div>
  `;
}

async function loadSessions() {
  const sessions = await fetch("/api/sessions").then((res) => res.json()).catch(() => []);
  renderSessionList(sessions);
  if (!sessions.length) return;
  const latest = sessions[0];
  document.getElementById("sessionMeta").textContent = `已保存 ${sessions.length} 次训练 / 最近：${latest.title}`;
}

function renderSessionList(sessions) {
  const target = document.getElementById("sessionList");
  if (!target) return;
  if (!sessions.length) {
    target.innerHTML = `<p class="muted">暂无可删除的本地 session。</p>`;
    return;
  }
  target.innerHTML = `
    <h4>最近本地记录</h4>
    ${sessions.slice(0, 5).map((session) => `
      <div class="session-row">
        <div>
          <strong>${escapeHtml(session.title || session.session_id)}</strong>
          <small>${escapeHtml(session.memory_status)} · ${escapeHtml(session.camera_view)} · ${formatDateTime(session.saved_at)}</small>
        </div>
        <button type="button" data-delete-session="${escapeHtml(session.session_id)}">删除</button>
      </div>
    `).join("")}
  `;
  target.querySelectorAll("[data-delete-session]").forEach((button) => {
    button.addEventListener("click", async () => {
      const sessionId = button.getAttribute("data-delete-session");
      if (!sessionId) return;
      if (!confirm("只删除本地 SQLite 中的这条训练记录；不会删除上传视频文件。确认删除？")) return;
      button.disabled = true;
      try {
        await deleteSession(sessionId);
        await loadSessions();
        await loadMemorySummary();
      } catch (error) {
        button.disabled = false;
        button.textContent = "失败";
        button.title = error.message;
      }
    });
  });
}

async function deleteSession(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadMemorySummary() {
  const memory = await fetch("/api/memory-summary").then((res) => res.json()).catch(() => null);
  if (!memory) return;
  renderMemorySummary(memory);
}

function renderMemorySummary(memory) {
  const values = memory.trend?.values || [];
  document.getElementById("memoryCount").textContent =
    `${memory.long_term_session_count} long-term / ${memory.review_session_count} review`;
  document.getElementById("memorySummary").textContent =
    memory.long_term_session_count
      ? `${memory.next_focus} 趋势：${memory.trend.direction}，累计变化 ${memory.trend.delta_ms ?? "n/a"} ms。`
      : "暂无长期记忆；每次分析后可手动选择写入长期记忆或仅短期复核。";
  document.getElementById("memoryChart").innerHTML = memoryBars(values);
  renderMemoryDetails(memory);
}

async function loadPrivacyBoundary() {
  const [boundary, uploadInventory] = await Promise.all([
    fetch("/api/privacy-boundary").then((res) => res.json()).catch(() => null),
    fetch("/api/upload-files").then((res) => res.json()).catch(() => null)
  ]);
  const statusEl = document.getElementById("privacyStatus");
  const target = document.getElementById("privacyBoundary");
  if (!statusEl || !target) return;
  if (!boundary) {
    statusEl.textContent = "unknown";
    target.innerHTML = `<p class="warning">隐私边界读取失败；不要上传或保存真实校队视频。</p>`;
    return;
  }
  statusEl.textContent = boundary.storage?.cloud_sync === "not_implemented" ? "local only" : "review";
  target.innerHTML = `
    <div class="report-evidence">
      <div><span>原始视频</span><strong>${escapeHtml(boundary.storage?.raw_video || "unknown")}</strong><small>不作为报告模型输入</small></div>
      <div><span>训练记忆</span><strong>${escapeHtml(boundary.storage?.sqlite_memory || "unknown")}</strong><small>本地 SQLite</small></div>
      <div><span>云端同步</span><strong>${escapeHtml(boundary.storage?.cloud_sync || "unknown")}</strong><small>未实现即不可承诺</small></div>
    </div>
    <h4>默认禁止</h4>
    ${(boundary.default_forbidden_uses || []).map((item) => `<p class="warning">${escapeHtml(item)}</p>`).join("")}
    <h4>需明确授权</h4>
    ${(boundary.requires_explicit_authorization_for || []).slice(0, 4).map((item) => `<p class="muted">${escapeHtml(item)}</p>`).join("")}
    <h4>本地数据导出</h4>
    <div class="privacy-export-controls">
      <label>本地用户 ID <input id="privacyUserId" value="local_user_001" /></label>
      <button type="button" id="downloadPrivacyExport">导出本地数据 JSON</button>
      <small>包含 SQLite session、记忆摘要和上传文件清单；不包含原始视频字节。</small>
    </div>
    <div id="privacyExportResult" class="cleanup-result"></div>
    <h4>本地用户数据删除</h4>
    <div class="privacy-export-controls">
      <button type="button" id="deleteLocalUserSessions">删除该用户本地 SQLite sessions</button>
      <small>只删除本机 SQLite 中该 user_id 的训练记录；不删除 data/uploads 原始视频文件。</small>
    </div>
    <div id="localUserDeleteResult" class="cleanup-result"></div>
    <h4>本地上传文件</h4>
    <div class="cleanup-controls">
      <label>清理超过 <input id="uploadCleanupDays" type="number" min="0" max="365" value="7" /> 天的受控上传文件</label>
      <div>
        <button type="button" id="previewUploadCleanup">预览清理</button>
        <button type="button" id="runUploadCleanup">执行清理</button>
      </div>
    </div>
    <div id="uploadCleanupResult" class="cleanup-result"></div>
    ${renderUploadInventory(uploadInventory)}
  `;
  bindPrivacyExportControl();
  bindLocalUserDeleteControl();
  bindUploadFileDeleteButtons();
  bindUploadCleanupControls();
}

function renderUploadInventory(inventory) {
  const files = Array.isArray(inventory?.files) ? inventory.files.slice(0, 6) : [];
  if (!files.length) return `<p class="muted">当前没有可列出的受控上传文件。</p>`;
  return `
    <div class="upload-file-list">
      ${files.map((file) => `
        <div class="upload-file-row">
          <div>
            <strong>${escapeHtml(file.file_name)}</strong>
            <small>${formatBytes(file.bytes)} · ${formatDateTime(file.modified_at)}</small>
          </div>
          <button type="button" data-delete-upload-file="${escapeHtml(file.file_name)}">删除</button>
        </div>
      `).join("")}
    </div>
  `;
}

function bindUploadFileDeleteButtons() {
  document.querySelectorAll("[data-delete-upload-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      const fileName = button.getAttribute("data-delete-upload-file");
      if (!fileName) return;
      if (!confirm("只删除 data/uploads 中这一个受控上传文件；不会删除 SQLite session。确认删除？")) return;
      button.disabled = true;
      try {
        await deleteUploadFile(fileName);
        await loadPrivacyBoundary();
      } catch (error) {
        button.disabled = false;
        button.textContent = "失败";
        button.title = error.message;
      }
    });
  });
}

function bindUploadCleanupControls() {
  document.getElementById("previewUploadCleanup")?.addEventListener("click", async () => {
    await runUploadCleanup(true);
  });
  document.getElementById("runUploadCleanup")?.addEventListener("click", async () => {
    if (!confirm("将按保留期删除 data/uploads 中符合 upload_* 格式的受控上传文件；不会删除 SQLite session。确认执行？")) return;
    await runUploadCleanup(false);
  });
}

function bindPrivacyExportControl() {
  document.getElementById("downloadPrivacyExport")?.addEventListener("click", async () => {
    const resultEl = document.getElementById("privacyExportResult");
    if (resultEl) resultEl.textContent = "正在生成本地 JSON 导出...";
    try {
      const payload = await fetchPrivacyExport(currentPrivacyUserId());
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `shooting-lab-privacy-export-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (resultEl) {
        resultEl.innerHTML = `<p class="muted">已生成本地导出：${payload.sessions?.length || 0} 个 session，${payload.upload_inventory?.count || 0} 个上传文件记录；不含视频字节。</p>`;
      }
    } catch (error) {
      if (resultEl) resultEl.innerHTML = `<p class="warning">导出失败：${escapeHtml(error.message)}</p>`;
    }
  });
}

function currentPrivacyUserId() {
  return document.getElementById("privacyUserId")?.value?.trim() || "local_user_001";
}

async function fetchPrivacyExport(userId = "local_user_001") {
  const response = await fetch(`/api/privacy-export?user_id=${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function bindLocalUserDeleteControl() {
  document.getElementById("deleteLocalUserSessions")?.addEventListener("click", async () => {
    const userId = currentPrivacyUserId();
    const resultEl = document.getElementById("localUserDeleteResult");
    if (!confirm(`只删除本地 SQLite 中 user_id=${userId} 的训练记录；不会删除上传视频文件。确认删除？`)) return;
    if (resultEl) resultEl.textContent = "正在删除该用户本地 SQLite sessions...";
    try {
      const result = await deleteLocalUserSessions(userId);
      if (resultEl) {
        resultEl.innerHTML = `<p class="warning">已删除 ${result.deleted} 条本地 SQLite session；原始视频文件未删除。</p>`;
      }
      await loadSessions();
      await loadMemorySummary();
    } catch (error) {
      if (resultEl) resultEl.innerHTML = `<p class="warning">删除失败：${escapeHtml(error.message)}</p>`;
    }
  });
}

async function deleteLocalUserSessions(userId) {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/sessions`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function runUploadCleanup(dryRun) {
  const days = Number(document.getElementById("uploadCleanupDays")?.value || 7);
  const resultEl = document.getElementById("uploadCleanupResult");
  if (resultEl) resultEl.textContent = dryRun ? "正在预览清理候选..." : "正在执行清理...";
  try {
    const result = await cleanupUploadFiles({ older_than_days: days, dry_run: dryRun });
    if (resultEl) {
      resultEl.innerHTML = `
        <p class="${dryRun ? "muted" : "warning"}">${dryRun ? "预览" : "已执行"}：${result.candidate_count} 个候选，删除 ${result.deleted_count || 0} 个。</p>
        ${result.candidates?.slice(0, 4).map((file) => `<p class="muted">${escapeHtml(file.file_name)} · ${formatBytes(file.bytes)}</p>`).join("") || ""}
      `;
    }
    if (!dryRun) await loadPrivacyBoundary();
  } catch (error) {
    if (resultEl) resultEl.innerHTML = `<p class="warning">清理失败：${escapeHtml(error.message)}</p>`;
  }
}

function renderMemoryDetails(memory) {
  const target = document.getElementById("memoryDetails");
  if (!target) return;
  const goals = memory.training_goals || [];
  const signals = memory.recurring_signals || [];
  const profile = memory.profile || {};
  const policy = memory.confidence_policy || {};
  target.innerHTML = `
    <div class="memory-grid">
      <div><span>本地用户</span><strong>${escapeHtml(profile.user_id || memory.user_id || "local_user_001")}</strong><small>${escapeHtml(profile.storage || "local_sqlite")}</small></div>
      <div><span>主目标</span><strong>${escapeHtml(profile.primary_training_goal || "未建立")}</strong><small>来自本地长期记忆</small></div>
      <div><span>趋势来源</span><strong>${escapeHtml(policy.trend_source || "long_term_only")}</strong><small>review excluded: ${policy.review_sessions_excluded ?? memory.review_session_count ?? 0}</small></div>
    </div>
    <h4>训练目标</h4>
    ${goals.length
      ? goals.map((goal) => `<p class="memory-pill">${escapeHtml(goal.goal)} · ${goal.count} 次</p>`).join("")
      : `<p class="muted">暂无训练目标历史。</p>`}
    <h4>历史候选信号</h4>
    ${signals.length
      ? signals.map((signal) => `<p class="memory-pill">${escapeHtml(signal.name)} · ${signal.count} 次 · ${escapeHtml(signal.latest_status)}</p>`).join("")
      : `<p class="muted">暂无长期候选信号；低置信 session 默认不进入趋势。</p>`}
  `;
}

function setReportLoading() {
  document.getElementById("coachReport").innerHTML = `<p class="muted">正在生成 evidence_packet，并请求 JSON 教练报告...</p>`;
}

function renderReportTracePanel(playerReport, labReport) {
  const refs = [
    ...(playerReport?.primary_issue?.evidence_refs || []).map((item) => ({ ...item, scope: "player.primary_issue" })),
    ...(labReport?.diagnosis?.evidence_refs || []).map((item) => ({ ...item, scope: "lab.diagnosis" }))
  ].slice(0, 8);
  const missing = (labReport?.missing_evidence || []).slice(0, Math.max(0, 3 - refs.length));
  if (!refs.length && !missing.length) return "";
  return `
    <h4>Evidence Trace</h4>
    <div class="report-trace">
      ${refs.map(renderTraceRef).join("")}
      ${missing.map((item) => `
        <div class="trace-row">
          <strong>缺失证据</strong>
          <span>signal_id(信号)：暂无 · metric_id(指标)：暂无 · frame(帧)：暂无 · rule_id(规则)：暂无 · missing_evidence(缺失)：${escapeHtml(item.value || item.reason || "required evidence")}</span>
          <small>影响：${escapeHtml(item.impact || "只支持复核、追问或重拍，不支撑动作错误结论")}</small>
        </div>
      `).join("")}
    </div>
    <p class="muted">证据追踪只展示当前 evidence packet 引用，不提高报告置信度。</p>
  `;
}

function renderTraceRef(item) {
  const fields = [
    ["signal_id", item.signal_id],
    ["metric_id", item.metric_id],
    ["frame", item.frame ?? item.frame_index],
    ["rule_id", item.rule_id],
    ["missing_evidence", item.missing_evidence]
  ].map(([key, value]) => [key, value === undefined || value === null || value === "" ? "n/a" : value]);
  return `
    <div class="trace-row">
      <strong>${escapeHtml(item.scope || "evidence_ref")}</strong>
      <span>${fields.map(([key, value]) => `${key}(${traceFieldLabel(key)})：${escapeHtml(value)}`).join(" · ")}</span>
      <small>${escapeHtml(item.value || item.status || item.reason || "证据引用")}</small>
    </div>
  `;
}

function renderReport(result, saved) {
  const report = result.report;
  const playerReport = result.player_report;
  const labReport = result.lab_report;
  const isFallback = String(result.mode || "").includes("fallback") || result.mode === "local_mock";
  document.getElementById("reportMode").textContent = reportModeLabel(result.mode, isFallback);
  document.getElementById("diagnosisTitle").textContent = report.primary_diagnosis.title;
  document.getElementById("diagnosisCopy").textContent = report.summary;
  const warnings = [
    result.error ? `降级原因：${escapeHtml(result.error)}` : "",
    result.validation_errors?.length ? `校验触发 fallback：${result.validation_errors.map(escapeHtml).join("；")}` : "",
    result.fallback_validation_errors?.length ? `本地 fallback 校验问题：${result.fallback_validation_errors.map(escapeHtml).join("；")}` : ""
  ].filter(Boolean);
  const diagnosis = report.primary_diagnosis || {};
  const uncertainties = diagnosis.uncertainties || [];
  const evidenceItems = diagnosis.evidence || [];
  const missingCount = labReport?.missing_evidence?.length || playerReport?.uncertainties?.length || 0;
  document.getElementById("coachReport").innerHTML = `
    <div class="report-hero">
      <span>${confidenceLabel(diagnosis.confidence)} · ${isFallback ? "本地候选报告" : "教练报告"}</span>
      <h3>${escapeHtml(diagnosis.title)}</h3>
      <p>${escapeHtml(report.summary)}</p>
    </div>
    <div class="report-meta">
      <span>报告置信：${confidenceLabel(diagnosis.confidence)}</span>
      <span>记忆写入：${memoryStatusLabel(saved?.memory_status)}</span>
      <span>缺失证据：${missingCount}</span>
    </div>
    <h4>判断依据</h4>
    <div class="report-evidence report-evidence-compact">
      ${evidenceItems.length ? evidenceItems.slice(0, 4).map((item) => `
        <div>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${evidenceSourceLabel(item.source)}${item.frame ? ` · 第 ${item.frame} 帧` : ""}</small>
        </div>
      `).join("") : `
        <div>
          <span>证据边界</span>
          <strong>当前只支持候选观察</strong>
          <small>${escapeHtml(uncertainties[0] || "缺少可引用的完整信号链，不能给强诊断。")}</small>
        </div>
      `}
    </div>
    ${uncertainties.length ? `<p class="warning">不确定性：${escapeHtml(uncertainties.slice(0, 2).join("；"))}</p>` : ""}
    <h4>下一步训练</h4>
    ${report.next_drills.slice(0, 3).map((drill) => `
      <div class="drill"><strong>${escapeHtml(drill.name)}</strong><span>${escapeHtml(drill.dosage)}</span><em>${escapeHtml(drill.success_metric)}</em></div>
    `).join("")}
    <h4>下次复测</h4>
    <p>${escapeHtml(report.follow_up.next_video_request)} 重点观察：${metricLabel(report.follow_up.next_metric_to_watch)}</p>
    ${renderLabSummaryDetails(playerReport, labReport, warnings)}
  `;
}

function renderLabSummaryDetails(playerReport, labReport, warnings = []) {
  if (!playerReport && !labReport && !warnings.length) return "";
  return `
    <details class="lab-details" open>
      <summary>实验室依据</summary>
      ${playerReport ? `
        <h4>球员版报告</h4>
        <div class="report-meta">
          <span>${escapeHtml(analysisStatusLabel(playerReport.analysis_status))}</span>
          <span>${escapeHtml(playerReport.analysis_status || "review_only")}</span>
          <span>${confidenceLabel(playerReport.confidence)}</span>
          <span>${escapeHtml(playerReport.schema_version)}</span>
        </div>
        <p>${escapeHtml(playerReport.primary_issue?.why_it_matters || playerReport.summary)}</p>
      ` : ""}
      ${labReport ? `
        <h4>实验室版摘要</h4>
        <div class="report-meta">
          <span>${escapeHtml(labReport.schema_version || "lab_report.v1")}</span>
          <span>${escapeHtml(labReport.evidence_packet_version || "evidence_packet.v1")}</span>
        </div>
        <div class="report-evidence">
          <div><span>模型状态</span><strong>${pipelineStatusLabel(labReport.model_status?.object_detection || "unknown")}</strong><small>${escapeHtml(labReport.model_status?.object_detection || "unknown")} · 用于球路候选，不等于动作评分</small></div>
          <div><span>姿态状态</span><strong>${pipelineStatusLabel(labReport.model_status?.precision_pose || "unknown")}</strong><small>${escapeHtml(labReport.model_status?.precision_pose || "unknown")} · 用于关键帧和关节角参考</small></div>
          ${labReport.multi_angle_context ? `<div><span>多角度</span><strong>${escapeHtml((labReport.multi_angle_context.present_views || []).join(" + ") || "unknown")}</strong><small>${syncPrecisionLabel(labReport.multi_angle_context.sync_assessment?.precision || "not_frame_accurate")}</small></div>` : ""}
          <div><span>缺失证据</span><strong>${labReport.missing_evidence?.length || 0}</strong><small>${(labReport.debug_notes?.degradation_reasons || []).slice(0, 3).map(degradationLabel).map(escapeHtml).join("；") || "暂无主要降级项"}</small></div>
        </div>
      ` : ""}
      ${renderReportTracePanel(playerReport, labReport)}
      ${warnings.map((warning) => `<p class="warning">${warning}</p>`).join("")}
    </details>
  `;
}

function confidenceLabel(value) {
  return {
    high: "高置信",
    medium: "中置信",
    low: "证据不足"
  }[value] || "待判断";
}

function reportModeLabel(mode, isFallback) {
  const labels = {
    local_mock: "本地候选",
    evidence_insufficient_fallback: "证据不足候选",
    request_validation_fallback: "请求降级",
    deepseek_error_fallback: "模型降级",
    deepseek_parse_fallback: "模型降级",
    deepseek_validation_fallback: "校验降级",
    deepseek: "教练报告"
  };
  return `${labels[mode] || mode || "待生成"}${isFallback ? " · 本地降级" : ""}`;
}

function releaseMotionStatusLabel(value) {
  return {
    candidate: "候选判断",
    low_confidence: "证据不足",
    fallback: "兜底估算",
    not_available: "未生成"
  }[value] || "待判断";
}

function signalStatusLabel(value) {
  return {
    candidate: "候选",
    low_confidence: "低置信",
    not_judgable: "不可判断",
    confirmed: "已确认"
  }[value] || value || "未知";
}

function ruleStatusLabel(value) {
  return {
    matched: "已匹配",
    candidate: "候选",
    blocked: "不支持诊断",
    not_judgable: "不可判断"
  }[value] || value || "未知";
}

function pipelineStatusLabel(value) {
  return {
    ready: "已就绪",
    metadata_ready: "元数据就绪",
    client_runtime: "浏览器运行",
    provided_by_adapter: "适配器已提供",
    adapter_not_configured: "未配置适配器",
    adapter_error: "适配器错误",
    adapter_timeout: "适配器超时",
    requires_server_video: "需要服务端视频",
    not_available: "不可用",
    unavailable: "不可用",
    fallback_contract: "兜底合同",
    browser_mediapipe: "浏览器姿态",
    rtmpose_mmpose: "精度姿态",
    local_sqlite: "本地记忆",
    healthy: "健康",
    degraded: "降级",
    health_request_failed: "健康检查失败",
    metric_ready: "指标就绪"
  }[value] || value || "未知";
}

function missingReasonLabel(value) {
  return {
    none: "无",
    no_landmarks: "未检测到人体关键点",
    less_than_min_required: "关键点样本不足",
    model_not_loaded: "模型未加载",
    no_video: "没有视频",
    video_metadata_unavailable: "视频元数据不可用",
    not_enough_wrist_path_points: "手腕路径点不足",
    set_point_not_observed: "举球到位缺少独立关键点",
    not_enough_shot_window_points: "投篮窗口点数不足",
    low_pose_confidence: "姿态置信度偏低",
    fallback_contract: "兜底估算"
  }[value] || value || "未知";
}

function missingTypeLabel(value) {
  return {
    view: "视角缺失",
    fps: "帧率不足",
    model: "模型证据不足",
    ball: "球路证据不足",
    sync_risk: "同步风险"
  }[value] || value || "缺失证据";
}

function analysisStatusLabel(value) {
  return {
    diagnosable: "可进入候选诊断",
    review_only: "仅供复核"
  }[value] || value || "未知";
}

function syncPrecisionLabel(value) {
  return {
    not_frame_accurate: "非逐帧同步",
    approximate: "近似同步"
  }[value] || value || "未知同步精度";
}

function traceFieldLabel(value) {
  return {
    signal_id: "信号",
    metric_id: "指标",
    frame: "帧",
    rule_id: "规则",
    missing_evidence: "缺失证据"
  }[value] || value;
}

function evidenceSourceLabel(value) {
  if (!value) return "证据来源：暂无";
  if (String(value).startsWith("coordination.")) return `协调信号：${value}`;
  if (String(value).startsWith("posture.")) return `姿态信号：${value}`;
  if (String(value).startsWith("release.")) return `出手信号：${value}`;
  return `证据来源：${value}`;
}

function metricLabel(value) {
  return {
    ball_lift_knee_delta_ms: "起球-下肢时序差",
    trunk_lean_release_deg: "出手躯干前倾",
    knee_angle_min_deg: "下蹲最低膝角",
    elbow_angle_release_deg: "出手肘角",
    release_height_ratio: "释放高度比",
    shoulder_elbow_wrist_alignment_error_deg: "肩肘腕顺线误差"
  }[value] || value || "待定指标";
}

function collectFeedback() {
  return {
    shot_result: document.getElementById("shotFeedback")?.value || "unknown",
    coach_helpfulness: document.getElementById("coachFeedback")?.value || "unknown",
    memory_status: document.getElementById("memoryStatus")?.value || "long_term",
    note: document.getElementById("feedbackNote")?.value?.trim() || ""
  };
}

function memoryStatusLabel(value) {
  return value === "long_term" ? "长期记忆" : value === "short_term_review" ? "短期复核" : "unknown";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function uploadVideo(file) {
  const form = new FormData();
  form.append("video", file, file.name);
  const response = await fetch("/api/upload-video", {
    method: "POST",
    body: form
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function deleteUpload(uploadId) {
  const response = await fetch(`/api/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function deleteUploadFile(fileName) {
  const response = await fetch(`/api/upload-files/${encodeURIComponent(fileName)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function cleanupUploadFiles(options) {
  const response = await fetch("/api/upload-files/cleanup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function updateTimeReadout() {
  const video = document.getElementById("shotVideo");
  const duration = video.duration || state.videoDurationMs / 1000 || 0;
  const current = video.currentTime || 0;
  document.getElementById("timeReadout").textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  document.querySelector(".progress span").style.width = `${pct}%`;
}

function seriesToKeyframes(series, releaseMotion = null) {
  const rows = Array.isArray(series) ? series.filter((row) => Number.isFinite(Number(row.frame))) : [];
  if (!rows.length) return [];
  const first = rows[0];
  const last = rows.at(-1) || first;
  const phases = releaseMotion?.phase_frames || {};
  if (phases.release || phases.lower_body_load || phases.set_point) {
    return uniqueKeyframes([
      { row: keyframeFromPhase(phases.shot_window_start, first), label: "投篮窗口开始" },
      { row: keyframeFromPhase(phases.lower_body_load), label: "下蹲最低点" },
      { row: keyframeFromPhase(phases.set_point), label: "举球到位" },
      { row: keyframeFromPhase(phases.release), label: "出手点" },
      { row: keyframeFromPhase(phases.shot_window_end, last), label: "投篮窗口结束" }
    ]);
  }
  const minKnee = minBy(rows, (row) => Number(row.knee_angle_deg ?? Infinity));
  const release = maxBy(rows, (row) => Number(row.ball_height_ratio ?? -Infinity));
  return uniqueKeyframes([
    { row: first, label: "准备" },
    { row: minKnee, label: "下蹲最低点" },
    { row: release, label: "出手点" },
    { row: last, label: "落地" }
  ]);
}

function keyframeFromPhase(phase, fallback = null) {
  if (phase && Number.isFinite(Number(phase.frame))) return { frame: Number(phase.frame), label: "" };
  return fallback;
}

function uniqueKeyframes(items) {
  const seen = new Set();
  return items
    .filter((item) => item.row && !seen.has(item.row.frame) && seen.add(item.row.frame))
    .map((item) => ({ frame: item.row.frame, label: item.label }));
}

function minBy(items, score) {
  return items.reduce((best, item) => (score(item) < score(best) ? item : best), items[0]);
}

function maxBy(items, score) {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best), items[0]);
}

function linePath(values) {
  if (!values.length) return "M0 50 L260 50";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 260;
    const y = 88 - ((value - min) / range) * 70;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function memoryBars(values) {
  if (!values.length) {
    return Array.from({ length: 7 }, () => `<div style="height: 12%"></div>`).join("");
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values.slice(-12).map((value) => {
    const height = 24 + ((value - min) / range) * 64;
    return `<div title="${value} ms" style="height: ${height.toFixed(0)}%"></div>`;
  }).join("");
}

function sizePoseCanvas(video, canvas) {
  syncVideoStage(video);
  const rect = video.closest(".video-stage")?.getBoundingClientRect() || video.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
}

function syncVideoStage(video) {
  const stage = video.closest(".video-stage");
  if (!stage || !video.videoWidth || !video.videoHeight) return;
  const panel = stage.parentElement;
  const containerWidth = Math.max(1, Math.floor(panel?.clientWidth || stage.parentElement?.getBoundingClientRect().width || stage.clientWidth));
  const aspect = video.videoWidth / video.videoHeight;
  const maxHeight = Math.max(320, Math.min(window.innerHeight * 0.68, 680));
  let width = containerWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  stage.style.width = `${Math.max(1, Math.round(width))}px`;
  stage.style.height = `${Math.max(1, Math.round(height))}px`;
  stage.style.marginInline = width < containerWidth - 2 ? "auto" : "0";
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timeout = setTimeout(done, 1200);
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = time;
  });
}

function renderPipelineNotice(message) {
  const target = document.getElementById("pipelineStatus");
  if (!target || state.evidencePacket) return;
  target.innerHTML = `<div><span>Fast Pose</span><strong>${escapeHtml(message)}</strong></div>${renderHealthRows(state.modelHealth || {})}`;
}

function setPoseStatus(message) {
  const target = document.getElementById("poseStatus");
  if (target && target.textContent !== message) target.textContent = message;
}

function renderOverlayDiagnostics(details = {}) {
  const statusEl = document.getElementById("overlayDiagnosticsStatus");
  const target = document.getElementById("overlayDiagnostics");
  if (!target) return;
  const status = details.status || "idle";
  const phase = details.phase?.label || "none";
  const lineCount = Number(details.line_count || 0);
  const releaseCount = Number(details.release_count || 0);
  const poseSource = details.pose_source || "none";
  const guardReason = details.guard_reason || "waiting_for_frame";
  const readabilityStatus = overlayReadabilityStatus(details, state.evidencePacket);
  const checklist = renderReadabilityChecklist(details, state.evidencePacket, readabilityStatus);
  if (statusEl) statusEl.textContent = status;
  target.innerHTML = `
    <div class="report-meta">
      <span>coach_overlay_diagnostics.v1</span>
      <span>source_check_only_not_real_sample_readability</span>
    </div>
    <div class="report-evidence">
      <div><span>Overlay Contract</span><strong>coach_overlay_diagnostics.v1</strong><small>not_real_sample_readability</small></div>
      <div><span>Pose Source</span><strong>${escapeHtml(poseSource)}</strong><small>MediaPipe preview or RTMPose evidence only</small></div>
      <div><span>Coach Lines</span><strong>${lineCount} lines</strong><small>line_groups: 脚膝髋力线 / 肩肘腕线 / 辅助手线 / 发力链线 / 躯干线</small></div>
      <div><span>Phase Label</span><strong>${escapeHtml(phase)}</strong><small>phase_source=evidence_keyframes_not_classifier</small></div>
      <div><span>Release Slice</span><strong>${releaseCount} wrist points</strong><small>pose_keypoint_release_motion_not_ball_flight · human_pose_motion_slice_only_no_airborne_ball_tracking</small></div>
      <div><span>Guard Policy</span><strong>${escapeHtml(guardReason)}</strong><small>visibility&lt;0.5 / score&lt;0.2 skip line drawing</small></div>
      <div data-readability-status="${escapeHtml(readabilityStatus)}"><span>Readability Status</span><strong>${escapeHtml(readabilityStatus)}</strong><small>manual_review_gate_not_quality_claim</small></div>
      <div><span>Export Boundary</span><strong>local PNG current frame</strong><small>local_browser_png_current_frame_no_video_export</small></div>
    </div>
    ${checklist}
  `;
}

function overlayReadabilityStatus(details = {}, evidence = null) {
  const sourceType = evidence?.video_context?.source_type || "unknown";
  const authorizedReal = ["representative_authorized", "real_school_team_authorized", "authorized_alpha_test_local_upload"].includes(sourceType);
  const lineCount = Number(details.line_count || 0);
  const poseSource = details.pose_source || "none";
  if (poseSource === "none" || lineCount <= 0) return "no_pose_evidence_for_readability";
  if (lineCount < 5) return "partial_overlay_seek_another_frame";
  if (!authorizedReal) return "synthetic_overlay_visible_not_real_readability";
  return "authorized_manual_readability_review_candidate";
}

function renderReadabilityChecklist(details = {}, evidence = null, readabilityStatus = "no_pose_evidence_for_readability") {
  const sourceType = evidence?.video_context?.source_type || "unknown";
  const sampleId = evidence?.video_context?.sample_id || "none";
  const authorizedReal = ["representative_authorized", "real_school_team_authorized", "authorized_alpha_test_local_upload"].includes(sourceType);
  const rows = [
    ["样例范围", authorizedReal ? "可人工复核" : "非真实授权样例", `${sourceType} / sample=${sampleId}`],
    ["Overlay 可读性", readabilityStatus, `pose=${details.pose_source || "none"} / guard=${details.guard_reason || "unknown"}`],
    ["阶段标签", details.phase?.label || "未命中", "phase_source=evidence_keyframes_not_classifier"],
    ["导出边界", "本地当前帧 PNG", "no video export / no cloud upload"]
  ];
  return `
    <h4>真实/授权样例可读性 checklist</h4>
    <div class="report-evidence report-evidence-compact">
      ${rows.map(([label, status, detail]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(status)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
      `).join("")}
    </div>
    <p class="warning">real_authorized_sample_readability_checklist.v1：只辅助人工看 overlay 是否清楚，不证明真实样例诊断质量。</p>
  `;
}

function formatMetricValue(key, value) {
  if (!Number.isFinite(value)) return "n/a";
  if (key.endsWith("_ratio")) return value.toFixed(2);
  return `${value.toFixed(1)}°`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDuration(seconds) {
  const safe = Number.isFinite(seconds) ? seconds : 0;
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toFixed(2).padStart(5, "0");
  return `${mins}:${secs}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  window.__shootingLabTestHooks = {
    renderEvidence,
    drawPrecisionPoseAtTime,
    exportAnnotatedFrame,
    addAnnotatedFrameReview,
    renderOverlayDiagnostics,
    renderMultiAngleEvidence,
    renderMemorySummary
  };
}
