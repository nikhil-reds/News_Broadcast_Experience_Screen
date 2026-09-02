/**
 * Highlight Reel Render Worker (stage 2 of 2)
 * --------------------------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:highlight       # tsx app/worker/highlight-reel.ts
 *
 * Flow: app/worker/highlight-analysis.ts (stage 1) asks Gemini which moments
 * to keep, then enqueues here with those segments already decided. This
 * worker only cuts and joins them with ffmpeg — no Gemini call happens in
 * this job, so an ffmpeg failure retries without re-spending a Gemini call.
 * Writes the reel back to the `videos` bucket under a `highlight-` prefix —
 * which is what Screen 06 loops.
 *
 * Requires ffmpeg/ffprobe on PATH (or FFMPEG_PATH / FFPROBE_PATH pointing at
 * them).
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { enqueueAllBackgroundsForSource, HIGHLIGHT_QUEUE, type HighlightRenderJob } from "@/lib/queue";
import { renderHighlightReel, FFMPEG_HIGHLIGHT_TIMEOUT_MS } from "@/lib/highlight-reel";
import { markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { startHeartbeat } from "@/lib/generation-heartbeat";

const WORKER_NAME = "highlight-reel-worker";
// A little above the ffmpeg pass's own timeout so a genuinely slow (not
// stuck) render's lock doesn't expire mid-render — see the watchdog plan's
// note on lockDuration vs. BullMQ's native stalled-job reclaim.
const LOCK_DURATION_MS = FFMPEG_HIGHLIGHT_TIMEOUT_MS + 2 * 60 * 1000;

const worker = new Worker<HighlightRenderJob>(
  HIGHLIGHT_QUEUE,
  async (job: Job<HighlightRenderJob>) => {
    const { cam1Filename, cam2Filename, cam3Filename, title, segments, audio, generationId } = job.data;
    await markTaskProcessing(generationId, "highlight-reel", job.id);
    console.log(
      `[${WORKER_NAME}] job ${job.id} → cutting "${cam1Filename}" + "${cam2Filename}" + "${cam3Filename}" ` +
        `(${segments.length} segment(s) from stage 1)`
    );

    const heartbeat = startHeartbeat({ generationId, taskType: "highlight-reel", jobId: job.id });
    let result;
    try {
      result = await renderHighlightReel(
        cam1Filename,
        cam2Filename,
        cam3Filename,
        {
          title,
          segments,
          audio: audio as Record<1 | 2 | 3, boolean>,
        },
        generationId,
        {
          timeoutMs: FFMPEG_HIGHLIGHT_TIMEOUT_MS,
          onHeartbeat: (pid) => heartbeat.touch(undefined, `ffmpeg pid ${pid}`),
        }
      );
      await heartbeat.stop();
    } catch (err) {
      await heartbeat.stop();
      throw err;
    }

    console.log(
      `[${WORKER_NAME}] job ${job.id} done: "${result.title}" — ` +
        `${result.segments.length} segment(s), ${result.durationSeconds}s → ${result.url}`
    );
    await markTaskCompleted(generationId, "highlight-reel");
    enqueueAllBackgroundsForSource(result.filename, generationId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${WORKER_NAME}] failed to pre-warm Screen 7 backgrounds for "${result.filename}": ${message}`);
    });

    return {
      filename: result.filename,
      url: result.url,
      size: result.size,
      durationSeconds: result.durationSeconds,
      segments: result.segments.length,
      model: result.model,
    };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Pure x264 re-encode is heavy; one session at a time.
    concurrency: 1,
    lockDuration: LOCK_DURATION_MS,
  }
);

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${HIGHLIGHT_QUEUE}"`);
});
worker.on("active", (job) => {
  console.log(`[${WORKER_NAME}] processing job ${job.id}`);
});
worker.on("completed", (job) => {
  console.log(`[${WORKER_NAME}] ✅ completed job ${job.id}`);
});
worker.on("failed", async (job, err) => {
  console.error(`[${WORKER_NAME}] ❌ job ${job?.id} failed: ${err.message}`);
  await markTaskFailed(
    job?.data?.generationId,
    "highlight-reel",
    err.message,
    job?.attemptsMade ?? 1,
    job?.opts?.attempts ?? 3,
    job?.id
  );
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
