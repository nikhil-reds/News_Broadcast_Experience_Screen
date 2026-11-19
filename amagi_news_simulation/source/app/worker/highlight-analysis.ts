import { flowProcessor } from "@/lib/flow-lifecycle";
/**
 * Highlight analysis worker (stage 1 of 2).
 *
 * Consumes the three-camera highlight-analysis queue, asks the configured
 * local vision service for a manifest, then hands the validated result to the
 * ffmpeg-backed highlight-reel worker.
 */
import "dotenv/config";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import {
  enqueueHighlightReel,
  HIGHLIGHT_ANALYSIS_QUEUE,
  type HighlightPairJob,
} from "@/lib/queue";
import { VIDEO_BUCKET, downloadObjectToFile, presignedGetUrl } from "@/lib/minio";
import { FFMPEG_BIN, probeDurationSeconds } from "@/lib/ffmpeg";
import { analyzeFrames, QWEN_VL_MODEL } from "@/lib/local-vision";
import { markTaskCompleted, markTaskFailed, markTaskProcessing } from "@/lib/generation";
import { withHeartbeat } from "@/lib/generation-heartbeat";
import type { CameraId } from "@/lib/camera-recordings";
import { attachWorkerHealth } from "@/lib/worker-health";

const WORKER_NAME = "highlight-analysis-worker";

const CAMERA_IDS = [1, 2, 3] as const;
const execFileAsync = promisify(execFile);
const CONTIGUITY_TOLERANCE_SECONDS = 0.05;

function continuousFallback(durations: Record<CameraId, number>) {
  // Every camera is a synchronized view of the same programme.  The fallback
  // therefore switches angles on a single shared timeline, rather than
  // joining three independent 0-8s clips (which breaks lip-sync).
  const sharedDuration = Math.min(durations[1], durations[2], durations[3], 24);
  if (sharedDuration < 6) throw new Error("recordings are too short for a continuous three-camera reel");
  const boundary1 = Number((sharedDuration / 3).toFixed(3));
  const boundary2 = Number(((sharedDuration * 2) / 3).toFixed(3));
  return {
    title: "Continuous multi-camera programme edit",
    segments: [
      { camera: 1 as CameraId, start: 0, end: boundary1, reason: "Continuous fallback primary presenter angle" },
      { camera: 2 as CameraId, start: boundary1, end: boundary2, reason: "Continuous fallback alternate presenter angle" },
      { camera: 3 as CameraId, start: boundary2, end: sharedDuration, reason: "Continuous fallback closing presenter angle" },
    ],
  };
}

export function validateManifest(
  manifest: Awaited<ReturnType<typeof analyzeFrames>>,
  durations: Record<CameraId, number>
) {
  const seen = new Set<string>();
  const segments = manifest.segments
    .filter((segment) =>
      ([1, 2, 3] as number[]).includes(segment.camera) &&
      Number.isFinite(segment.start) &&
      Number.isFinite(segment.end) &&
      segment.end > segment.start &&
      segment.end - segment.start >= 2 &&
      segment.end - segment.start <= 30 &&
      segment.start >= 0 &&
      segment.end <= durations[segment.camera as CameraId] &&
      typeof segment.reason === "string" &&
      segment.reason.trim().length >= 8
    )
    .map((segment) => ({
      camera: segment.camera as CameraId,
      start: Math.max(0, segment.start),
      end: segment.end,
      reason: segment.reason,
    }))
    .filter((segment) => {
      const key = `${segment.camera}:${segment.start.toFixed(2)}:${segment.end.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start || a.camera - b.camera);

  if (!manifest.title.trim() || segments.length === 0) {
    throw new Error("vision service returned no usable highlight segments");
  }
  const cameras = new Set(segments.map((segment) => segment.camera));
  if (CAMERA_IDS.some((camera) => !cameras.has(camera))) {
    throw new Error(`vision manifest missing camera coverage; got ${[...cameras].sort().join(",") || "none"}`);
  }
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const gap = current.start - previous.end;
    if (Math.abs(gap) > CONTIGUITY_TOLERANCE_SECONDS) {
      throw new Error(
        `vision manifest is not continuous between segments ${index} and ${index + 1}: ` +
          `expected ${previous.end.toFixed(3)}s, got ${current.start.toFixed(3)}s`
      );
    }
  }

  return {
    title: manifest.title.trim(),
    segments,
    audio: { 1: true, 2: true, 3: true },
  };
}

async function sourceMedia(filenames: [string, string, string]) {
  const workDir = await mkdtemp(join(tmpdir(), "highlight-analysis-"));
  try {
    const paths = filenames.map((filename, index) => join(workDir, `camera-${index + 1}.mp4`)) as [string, string, string];
    await Promise.all(filenames.map((filename, index) => downloadObjectToFile(VIDEO_BUCKET, filename, paths[index])));
    const values = await Promise.all(paths.map((path) => probeDurationSeconds(path)));
    const previews = await Promise.all(paths.map(async (path, index) => {
      const preview = join(workDir, `camera-${index + 1}.jpg`);
      await execFileAsync(FFMPEG_BIN, ["-y", "-ss", "2", "-i", path, "-frames:v", "1", "-q:v", "4", preview], { timeout: 120000 });
      return `data:image/jpeg;base64,${(await readFile(preview)).toString("base64")}`;
    }));
    return {
      durations: { 1: values[0], 2: values[1], 3: values[2] } as Record<CameraId, number>,
      previews,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const worker = new Worker<HighlightPairJob>(
  HIGHLIGHT_ANALYSIS_QUEUE,
  flowProcessor(async (job: Job<HighlightPairJob>) => {
    const { cam1Filename, cam2Filename, cam3Filename, generationId, revision } = job.data;
    await markTaskProcessing(generationId, "highlight-analysis", job.id);

    const filenames: [string, string, string] = [cam1Filename, cam2Filename, cam3Filename];
    const media = await sourceMedia(filenames);
    const durations = media.durations;
    const prompt = [
      "You are a professional news-video editor creating a continuous multi-camera programme edit from three synchronized cameras.",
      "Choose camera angles only: every segment must cover the next contiguous moment of the same recording timeline. Never skip, repeat, reorder, overlap, or jump in time.",
      "The original master audio remains continuous, so every camera switch must use the identical source timestamp to preserve lip-sync.",
      "Include at least one meaningful segment from camera 1, camera 2, and camera 3.",
      "Prioritize the clearest, sharpest, best-framed primary presenter shot, visible eyes and face, stable exposure, natural expression, and news relevance.",
      "Use alternate cameras only when they add clear visual variety or a better presenter view; avoid repetition, overlaps, and unnecessary cuts.",
      "Preserve chronology, avoid cutting off spoken sentences, and make each next segment start exactly where the previous segment ends. Every segment must be 2–30 seconds and within the stated camera duration.",
      "Return ONLY compact JSON with title and segments. Each segment must contain only camera (1, 2, or 3), start, end, and a short reason. Do not include visual_quality, markdown, commentary, or extra fields.",
      'The JSON shape is {"title":"...","segments":[{"camera":1,"start":4,"end":11,"reason":"clear presenter shot"}]}.',
      `Camera durations: 1=${durations[1].toFixed(2)}s, 2=${durations[2].toFixed(2)}s, 3=${durations[3].toFixed(2)}s.`,
      `Camera 1: ${cam1Filename}`,
      `Camera 2: ${cam2Filename}`,
      `Camera 3: ${cam3Filename}`,
    ].join("\n");

    const images = await Promise.all(
      [cam1Filename, cam2Filename, cam3Filename].map((filename) =>
        presignedGetUrl(VIDEO_BUCKET, filename, 900)
      )
    );

    let manifest;
    let selectionMode: "ai" | "fallback" = "ai";
    let fallbackReason: string | undefined;
    try {
      manifest = await withHeartbeat(
        { generationId, taskType: "highlight-analysis", jobId: job.id },
        () => analyzeFrames(prompt, media.previews)
      );
    } catch (error) {
      console.warn(
        `[${WORKER_NAME}] vision service unavailable (${error instanceof Error ? error.message : "unknown error"}); ` +
          "using a bounded continuous multi-camera fallback"
      );
      manifest = continuousFallback(durations);
      selectionMode = "fallback";
      fallbackReason = error instanceof Error ? error.message : "vision inference failed";
    }
    let analysis;
    try {
      analysis = validateManifest(manifest, durations);
    } catch (firstError) {
      const repairPrompt = `${prompt}\nThe previous manifest was invalid: ${firstError instanceof Error ? firstError.message : "invalid manifest"}. Re-select segments for cameras 1, 2, and 3 where each segment start is exactly the prior segment end (within 0.05 seconds). Do not omit any camera or leave gaps, overlaps, repeated time ranges, or timeline jumps.`;
      const repaired = await withHeartbeat(
        { generationId, taskType: "highlight-analysis", jobId: job.id },
        () => analyzeFrames(repairPrompt, media.previews)
      );
      try {
        analysis = validateManifest(repaired, durations);
      } catch (repairError) {
        console.warn(`[${WORKER_NAME}] bounded repair failed; using degraded fallback: ${repairError instanceof Error ? repairError.message : "invalid manifest"}`);
        const fallback = continuousFallback(durations);
        analysis = validateManifest(fallback, durations);
        selectionMode = "fallback";
        fallbackReason = repairError instanceof Error ? repairError.message : "AI manifest validation failed";
      }
    }
    analysis = { ...analysis, selectionMode, fallbackReason };

    await enqueueHighlightReel(
      cam1Filename,
      cam2Filename,
      cam3Filename,
      analysis,
      generationId,
      revision
    );
    await markTaskCompleted(generationId, "highlight-analysis");
    console.log(`[${WORKER_NAME}] job ${job.id} complete using ${QWEN_VL_MODEL}`);
    return analysis;
  }),
  { name: WORKER_NAME, connection: redisConnection, concurrency: 1 }
);
attachWorkerHealth(worker, { workerName: WORKER_NAME, queueName: HIGHLIGHT_ANALYSIS_QUEUE, model: QWEN_VL_MODEL });

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${HIGHLIGHT_ANALYSIS_QUEUE}"`);
});
worker.on("failed", async (job, error) => {
  console.error(`[${WORKER_NAME}] job ${job?.id} failed: ${error.message}`);
  await markTaskFailed(
    job?.data?.generationId,
    "highlight-analysis",
    error.message,
    job?.attemptsMade ?? 1,
    job?.opts?.attempts ?? 3,
    job?.id
  );
});
worker.on("error", (error) => console.error(`[${WORKER_NAME}] worker error: ${error.message}`));

async function shutdown() {
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
