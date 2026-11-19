import { flowProcessor } from "@/lib/flow-lifecycle";
/**
 * Video Export Worker
 * --------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:video-export   # tsx app/worker/video-export.ts
 *
 * Flow: POST /api/video-export creates a queued VideoJob row and enqueues a
 * job here -> this worker burns that language's subtitles (and, if the
 * session had a background selected on Screen 07, that background too) onto
 * the chosen highlight reel, scaled/cropped to the requested aspect, and
 * writes the result to the MinIO `videos` bucket — which is what Screens
 * 11/12 poll for.
 *
 * Requires ffmpeg/ffprobe on PATH (or FFMPEG_PATH / FFPROBE_PATH pointing at
 * them).
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { VIDEO_EXPORT_QUEUE, type VideoExportJob } from "@/lib/queue";
import { composeExportVideo, FFMPEG_EXPORT_TIMEOUT_MS } from "@/lib/video-export";
import { prisma } from "@/lib/prisma";
import { publishVariant, failVariant, markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { startHeartbeat } from "@/lib/generation-heartbeat";
import { attachWorkerHealth } from "@/lib/worker-health";

const WORKER_NAME = "video-export-worker";
// A little above the ffmpeg pass's own timeout so a genuinely slow (not
// stuck) render's lock doesn't expire mid-render — see the watchdog plan's
// note on lockDuration vs. BullMQ's native stalled-job reclaim.
const LOCK_DURATION_MS = FFMPEG_EXPORT_TIMEOUT_MS + 2 * 60 * 1000;

const worker = new Worker<VideoExportJob>(
  VIDEO_EXPORT_QUEUE,
  flowProcessor(async (job: Job<VideoExportJob>) => {
    const { videoJobId, reelFilename, sourceAudio, language, aspect, backgroundId, generationId, screenId, audioLanguage, voiceId, exportKey } =
      job.data;
    console.log(
      `[${WORKER_NAME}] job ${job.id} → ${aspect} "${reelFilename}" in ${language}` +
        (backgroundId && backgroundId !== "none" ? ` onto background "${backgroundId}"` : "")
    );

    // generationId/screenId are absent on legacy jobs (pre-dating this
    // variant-publish plumbing) — every generation/task-tracking call below
    // is already a no-op without a generationId, and the screenId-specific
    // ones are additionally guarded, so legacy jobs just skip straight to
    // the ffmpeg work exactly as before.
    if (!exportKey || !audioLanguage || !voiceId) throw new Error("Legacy export job has no audio selection; generate a new export");
    const variant = { language, aspect, backgroundId, audioLanguage, voiceId, exportKey };
    const taskType = screenId ? `video-export-${screenId}-${exportKey.slice(0, 12)}` : null;

    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: "processing" },
    });
    if (taskType) await markTaskProcessing(generationId, taskType, job.id);

    const heartbeat = taskType ? startHeartbeat({ generationId, taskType, jobId: job.id }) : null;

    try {
      const result = await composeExportVideo({
        reelFilename,
        exportKey, audioLanguage, voiceId,
        sourceAudio,
        language,
        aspect,
        backgroundId,
        onHeartbeat: (pid) => heartbeat?.touch(undefined, `ffmpeg pid ${pid}`),
      });
      await heartbeat?.stop();

      await prisma.videoJob.update({
        where: { id: videoJobId },
        data: {
          status: "completed",
          outputFilename: result.filename,
          outputUrl: result.url,
          size: result.size,
          dubAudioKey: result.dubAudioKey,
          dubManifestKey: result.dubManifestKey,
          errorMessage: null,
        },
      });
      if (taskType) await markTaskCompleted(generationId, taskType);

      console.log(`[${WORKER_NAME}] job ${job.id} done → ${result.url}`);

      if (generationId && screenId) {
        await publishVariant(
          screenId,
          generationId,
          variant,
          { outputUrl: result.url, outputFilename: result.filename, size: result.size }
        );
      }

      return result;
    } catch (err) {
      await heartbeat?.stop();
      const message = err instanceof Error ? err.message : String(err);
      await prisma.videoJob.update({
        where: { id: videoJobId },
        data: { status: "failed", errorMessage: message },
      });
      // job.attemptsMade only counts attempts completed *before* this one —
      // BullMQ doesn't increment it for the in-flight attempt until
      // moveToFailed runs (after this handler returns), so the in-flight
      // attempt has to be added in manually to detect "this is the last try."
      const attemptsMade = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 3;
      if (taskType) await markTaskFailed(generationId, taskType, message, attemptsMade, maxAttempts, job.id);
      if (generationId && screenId && attemptsMade >= maxAttempts) {
        await failVariant(screenId, generationId, variant, message);
      }
      throw err;
    }
  }),
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // ffmpeg overlay chain + re-encode is heavy; one export at a time.
    concurrency: 1,
    lockDuration: LOCK_DURATION_MS,
  }
);
attachWorkerHealth(worker, { workerName: WORKER_NAME, queueName: VIDEO_EXPORT_QUEUE });

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${VIDEO_EXPORT_QUEUE}"`);
});
worker.on("active", (job) => {
  console.log(`[${WORKER_NAME}] processing job ${job.id}`);
});
worker.on("completed", (job) => {
  console.log(`[${WORKER_NAME}] ✅ completed job ${job.id}`);
});
worker.on("failed", (job, err) => {
  console.error(`[${WORKER_NAME}] ❌ job ${job?.id} failed: ${err.message}`);
});
worker.on("error", (err) => {
  console.error(`[${WORKER_NAME}] worker error: ${err.message}`);
});

async function shutdown() {
  console.log(`[${WORKER_NAME}] shutting down…`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
