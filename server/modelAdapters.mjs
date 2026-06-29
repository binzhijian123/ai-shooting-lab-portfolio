import { spawn } from "node:child_process";

export async function runModelAdapters(input) {
  const context = {
    video_path: input.video_path || null,
    video_duration_ms: input.video_duration_ms || null,
    fps: input.fps || null,
    camera_view: input.camera_view || null
  };

  const [yolo, rtmpose] = await Promise.all([
    runConfiguredJsonCommand("YOLO_COMMAND", context),
    runConfiguredJsonCommand("RTMPOSE_COMMAND", context)
  ]);

  return {
    object_detection: normalizeYoloResult(yolo, Boolean(input.video_path)),
    precision_pose: normalizePoseResult(rtmpose, Boolean(input.video_path))
  };
}

export async function runAdapterHealthChecks() {
  const [yolo, rtmpose] = await Promise.all([
    runConfiguredJsonCommand("YOLO_COMMAND", {
      health_check: true,
      model: process.env.YOLO_MODEL || "yolo11n.pt",
      world_model: process.env.YOLO_WORLD_MODEL || null
    }, Number(process.env.MODEL_HEALTH_TIMEOUT_MS || 15000)),
    runConfiguredJsonCommand("RTMPOSE_COMMAND", {
      health_check: true
    }, Number(process.env.MODEL_HEALTH_TIMEOUT_MS || 15000))
  ]);

  return {
    yolo: normalizeHealthResult("YOLO", yolo),
    rtmpose: normalizeHealthResult("RTMPose/MMPose", rtmpose)
  };
}

export async function readVideoMetadata(videoPath) {
  if (!videoPath) return { status: "missing_video_path", source: "not_available" };
  const result = await runConfiguredJsonCommand("RTMPOSE_COMMAND", {
    metadata_check: true,
    video_path: videoPath
  }, Number(process.env.MODEL_METADATA_TIMEOUT_MS || 10000));
  if (!result.configured) return { status: "adapter_not_configured", source: "not_available" };
  if (result.error) return { status: "metadata_error", source: "not_available", error: result.error };
  const metadata = result.payload?.metadata || {};
  return {
    status: result.payload?.status || "metadata_ready",
    source: metadata.source || result.payload?.engine || "opencv",
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    fps: Number(metadata.fps || 0),
    frame_count: Number(metadata.frame_count || 0),
    duration_ms: Number(metadata.duration_ms || 0)
  };
}

export function adapterCapabilities() {
  return {
    yolo: {
      configured: Boolean(process.env.YOLO_COMMAND),
      env: "YOLO_COMMAND",
      input_contract: "JSON on stdin: { video_path, video_duration_ms, fps, camera_view }",
      output_contract: "{ detections: { ball, rim, person }, ball_path_offset_cm?, shot_summary?, shot_events?, trajectory? }"
    },
    rtmpose: {
      configured: Boolean(process.env.RTMPOSE_COMMAND),
      env: "RTMPOSE_COMMAND",
      input_contract: "JSON on stdin: { video_path, video_duration_ms, fps, camera_view }",
      output_contract: "{ pose_series, confidence }"
    }
  };
}

function normalizeHealthResult(engine, result) {
  if (!result.configured) {
    return {
      engine,
      configured: false,
      ok: false,
      status: "adapter_not_configured",
      missing: ["adapter_command"]
    };
  }
  if (result.error) {
    return {
      engine,
      configured: true,
      ok: false,
      status: "health_check_error",
      error: result.error,
      missing: ["health_check"]
    };
  }
  const payload = result.payload || {};
  return {
    engine: payload.engine || engine,
    configured: true,
    ok: Boolean(payload.ok),
    status: payload.status || (payload.ok ? "healthy" : "degraded"),
    model: payload.model || null,
    device: payload.device || null,
    checks: payload.checks || {},
    weights: payload.weights || {},
    missing: payload.missing || []
  };
}

function normalizeYoloResult(result, hasVideoPath) {
  if (!hasVideoPath) {
    return {
      engine: "YOLO",
      runtime: "server_or_worker",
      status: "requires_server_video",
      detections: {
        ball: { confidence: 0, source: "not_run" },
        rim: { confidence: 0, source: "not_run" },
        person: { confidence: 0, source: "not_run" }
      },
      shot_summary: emptyShotSummary("requires_server_video"),
      shot_events: [],
      trajectory: null,
      ball_path_offset_cm: null
    };
  }
  if (!result.configured) {
    return {
      engine: "YOLO",
      runtime: "server_or_worker",
      status: "adapter_not_configured",
      detections: {
        ball: { confidence: 0, source: "not_configured" },
        rim: { confidence: 0, source: "not_configured" },
        person: { confidence: 0, source: "not_configured" }
      },
      shot_summary: emptyShotSummary("adapter_not_configured"),
      shot_events: [],
      trajectory: null,
      ball_path_offset_cm: null
    };
  }
  if (result.error) {
    return {
      engine: "YOLO",
      runtime: "server_or_worker",
      status: "adapter_error",
      error: result.error,
      detections: {
        ball: { confidence: 0, source: "adapter_error" },
        rim: { confidence: 0, source: "adapter_error" },
        person: { confidence: 0, source: "adapter_error" }
      },
      shot_summary: emptyShotSummary("adapter_error"),
      shot_events: [],
      trajectory: null,
      ball_path_offset_cm: null
    };
  }
  const payload = result.payload || {};
  if (payload.error) {
    return {
      engine: "YOLO",
      runtime: "server_or_worker",
      status: "adapter_error",
      error: payload.detail ? `${payload.error}: ${payload.detail}` : payload.error,
      detections: {
        ball: { confidence: 0, source: "adapter_error" },
        rim: { confidence: 0, source: "adapter_error" },
        person: { confidence: 0, source: "adapter_error" }
      },
      shot_summary: emptyShotSummary("adapter_error"),
      shot_events: [],
      trajectory: null,
      ball_path_offset_cm: null
    };
  }
  return {
    engine: "YOLO",
    runtime: "server_or_worker",
    status: "provided_by_adapter",
    detections: payload.detections || {},
    ball_path_offset_cm: Number.isFinite(payload.ball_path_offset_cm) ? payload.ball_path_offset_cm : null,
    shot_summary: normalizeShotSummary(payload.shot_summary),
    shot_events: Array.isArray(payload.shot_events) ? payload.shot_events : [],
    trajectory: payload.trajectory || null,
    inspired_by: payload.inspired_by || null
  };
}

function emptyShotSummary(status) {
  return {
    status,
    attempts: 0,
    made: 0,
    missed: 0,
    candidates: 0,
    confidence: 0
  };
}

function normalizeShotSummary(summary) {
  if (!summary || typeof summary !== "object") return emptyShotSummary("not_available");
  return {
    status: summary.status || "unknown",
    attempts: Number(summary.attempts || 0),
    made: Number(summary.made || 0),
    missed: Number(summary.missed || 0),
    candidates: Number(summary.candidates || 0),
    confidence: Number(summary.confidence || 0),
    rim_frame: Number.isFinite(summary.rim_frame) ? summary.rim_frame : null,
    sample_count: Number(summary.sample_count || 0),
    reason: summary.reason || null
  };
}

function normalizePoseResult(result, hasVideoPath) {
  if (!hasVideoPath) {
    return {
      engine: "RTMPose/MMPose",
      runtime: "server_or_worker",
      status: "requires_server_video",
      confidence: 0
    };
  }
  if (!result.configured) {
    return {
      engine: "RTMPose/MMPose",
      runtime: "server_or_worker",
      status: "adapter_not_configured",
      confidence: 0
    };
  }
  if (result.error) {
    return {
      engine: "RTMPose/MMPose",
      runtime: "server_or_worker",
      status: "adapter_error",
      error: result.error,
      confidence: 0
    };
  }
  if (result.payload?.error) {
    return {
      engine: "RTMPose/MMPose",
      runtime: "server_or_worker",
      status: "adapter_error",
      error: result.payload.detail ? `${result.payload.error}: ${result.payload.detail}` : result.payload.error,
      confidence: 0
    };
  }
  return {
    engine: "RTMPose/MMPose",
    runtime: "server_or_worker",
    status: "provided_by_adapter",
    confidence: Number(result.payload?.confidence || 0),
    model: result.payload?.model || null,
    device: result.payload?.device || null,
    image_width: Number(result.payload?.image_width || 0),
    image_height: Number(result.payload?.image_height || 0),
    fps: Number(result.payload?.fps || 0),
    frame_count: Number(result.payload?.frame_count || 0),
    sampled_frames: Array.isArray(result.payload?.sampled_frames) ? result.payload.sampled_frames : [],
    sampling_policy: result.payload?.sampling_policy || null,
    pose_series: result.payload?.pose_series || []
  };
}

function runConfiguredJsonCommand(envName, input, timeoutMs = Number(process.env.MODEL_ADAPTER_TIMEOUT_MS || 30000)) {
  const command = process.env[envName];
  if (!command) return Promise.resolve({ configured: false });

  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ configured: true, error: `${envName} timed out` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ configured: true, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        try {
          const payload = JSON.parse(stdout || "{}");
          resolve({ configured: true, payload });
          return;
        } catch {
          // Fall through to stderr-based error.
        }
        resolve({ configured: true, error: stderr.slice(0, 600) || `${envName} exited ${code}` });
        return;
      }
      try {
        resolve({ configured: true, payload: JSON.parse(stdout || "{}") });
      } catch (error) {
        resolve({ configured: true, error: `invalid JSON from ${envName}: ${error.message}` });
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
