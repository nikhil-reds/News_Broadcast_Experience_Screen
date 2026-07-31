/**
 * Highlight Reel Worker
 * ---------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:highlight       # tsx app/worker/highlight-reel.ts
 *
 * Flow: both cameras stop together -> each take is stored by
 * POST /api/save-recording in the MinIO `videos` bucket -> the second upload
 * finds its counterpart and enqueues a job on the `highlight-reel` queue.
 * This worker consumes each job, sends both takes to Gemini 2.5 Pro to find the
 * most engaging seconds, cuts and joins those moments with ffmpeg, and writes
 * the reel back to the `videos` bucket under a `highlight-` prefix — which is
 * what Screen 06 loops.
 *
 * Requires GEMINI_API_KEY in .env and ffmpeg/ffprobe on PATH (or FFMPEG_PATH /
 * FFPROBE_PATH pointing at them).
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { HIGHLIGHT_QUEUE, type HighlightReelJob } from "@/lib/queue";
import { buildHighlightReel } from "@/lib/highlight-reel";

const WORKER_NAME = "highlight-reel-worker";

const worker = new Worker<HighlightReelJob>(
  HIGHLIGHT_QUEUE,
  async (job: Job<HighlightReelJob>) => {
    const { cam1Filename, cam2Filename } = job.data;
    console.log(
      `[${WORKER_NAME}] job ${job.id} → cutting "${cam1Filename}" + "${cam2Filename}"`
    );

    const result = await buildHighlightReel(cam1Filename, cam2Filename);

    console.log(
      `[${WORKER_NAME}] job ${job.id} done: "${result.title}" — ` +
        `${result.segments.length} segment(s), ${result.durationSeconds}s → ${result.url}`
    );
    for (const segment of result.segments) {
      console.log(
        `[${WORKER_NAME}]   cam${segment.camera} ` +
          `${segment.start.toFixed(1)}s–${segment.end.toFixed(1)}s: ${segment.reason}`
      );
    }

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
    // Gemini upload + x264 re-encode is heavy; one session at a time.
    concurrency: 1,
    // A long take can spend minutes in Gemini alone before ffmpeg starts.
    lockDuration: 30 * 60 * 1000,
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
