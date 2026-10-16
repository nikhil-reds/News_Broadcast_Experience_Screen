/**
 * Highlight analysis worker (stage 1 of 2).
 *
 * Consumes the three-camera highlight-analysis queue, asks the configured
 * local vision service for a manifest, then hands the validated result to the
 * ffmpeg-backed highlight-reel worker.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import {
  enqueueHighlightReel,
  HIGHLIGHT_ANALYSIS_QUEUE,
  type HighlightPairJob,
} from "@/lib/queue";
import { VIDEO_BUCKET, presignedGetUrl } from "@/lib/minio";
import { analyzeFrames, QWEN_VL_MODEL } from "@/lib/local-vision";
import { markTaskCompleted, markTaskFailed, markTaskProcessing } from "@/lib/generation";
import { withHeartbeat } from "@/lib/generation-heartbeat";
import type { CameraId } from "@/lib/camera-recordings";

const WORKER_NAME = "highlight-analysis-worker";

function validateManifest(manifest: Awaited<ReturnType<typeof analyzeFrames>>) {
  const segments = manifest.segments
    .filter((segment) =>
      ([1, 2, 3] as number[]).includes(segment.camera) &&
      Number.isFinite(segment.start) &&
      Number.isFinite(segment.end) &&
      segment.end > segment.start &&
      typeof segment.reason === "string"
    )
    .map((segment) => ({
      camera: segment.camera as CameraId,
      start: Math.max(0, segment.start),
      end: segment.end,
      reason: segment.reason,
    }));

  if (!manifest.title.trim() || segments.length === 0) {
    throw new Error("vision service returned no usable highlight segments");
  }

  return {
    title: manifest.title.trim(),
    segments,
    audio: { 1: true, 2: true, 3: true },
  };
}

const worker = new Worker<HighlightPairJob>(
  HIGHLIGHT_ANALYSIS_QUEUE,
  async (job: Job<HighlightPairJob>) => {
    const { cam1Filename, cam2Filename, cam3Filename, generationId } = job.data;
    await markTaskProcessing(generationId, "highlight-analysis", job.id);

    const prompt = [
      "Select the strongest short news highlight moments from the three camera recordings.",
      "Return JSON with title and segments. Each segment must contain camera (1, 2, or 3),",
      "start, end, and reason. Keep segments between 2 and 30 seconds and preserve chronology.",
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
    try {
      manifest = await withHeartbeat(
        { generationId, taskType: "highlight-analysis", jobId: job.id },
        () => analyzeFrames(prompt, images)
      );
    } catch (error) {
      const fallbackEnd = Number(process.env.HIGHLIGHT_FALLBACK_DURATION_SECONDS || 8);
      console.warn(
        `[${WORKER_NAME}] vision service unavailable (${error instanceof Error ? error.message : "unknown error"}); ` +
          `using bounded fallback segment 0-${fallbackEnd}s`
      );
      manifest = {
        title: "Automatic highlight fallback",
        segments: [{ camera: 1 as CameraId, start: 0, end: fallbackEnd, reason: "Vision service unavailable; bounded fallback segment" }],
      };
    }
    const analysis = validateManifest(manifest);

    await enqueueHighlightReel(
      cam1Filename,
      cam2Filename,
      cam3Filename,
      analysis,
      generationId
    );
    await markTaskCompleted(generationId, "highlight-analysis");
    console.log(`[${WORKER_NAME}] job ${job.id} complete using ${QWEN_VL_MODEL}`);
    return analysis;
  },
  { name: WORKER_NAME, connection: redisConnection, concurrency: 1 }
);

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
