/**
 * Highlight Analysis Worker (stage 1 of 2)
 * -----------------------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:highlight-analysis   # tsx app/worker/highlight-analysis.ts
 *
 * Flow: all 3 cameras stop together -> each take is stored by
 * POST /api/save-recording in the MinIO `videos` bucket -> the last of the
 * three (for that recording session) enqueues a job here
 * (lib/highlight-pairing.ts). This worker sends all three takes to Gemini
 * 2.5 Pro to find the most engaging seconds, then — on success — enqueues
 * stage 2 (app/worker/highlight-reel.ts) with those segments already
 * decided, so the ffmpeg cut/concat never needs to re-ask Gemini anything.
 *
 * Requires GEMINI_API_KEY in .env and ffmpeg/ffprobe on PATH (or FFMPEG_PATH /
 * FFPROBE_PATH pointing at them — used here only to probe duration/audio).
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { HIGHLIGHT_ANALYSIS_QUEUE, type HighlightPairJob, enqueueHighlightReel } from "@/lib/queue";
import { analyzeHighlightSegments, HIGHLIGHT_ANALYSIS_TIMEOUT_MS } from "@/lib/highlight-analysis";
import { markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { startHeartbeat } from "@/lib/generation-heartbeat";

const WORKER_NAME = "highlight-analysis-worker";
// A little above the Gemini call's own timeout so a genuinely slow (not
// stuck) analysis's lock doesn't expire mid-call — see the watchdog plan's
// note on lockDuration vs. BullMQ's native stalled-job reclaim.
const LOCK_DURATION_MS = HIGHLIGHT_ANALYSIS_TIMEOUT_MS + 2 * 60 * 1000;

const worker = new Worker<HighlightPairJob>(
  HIGHLIGHT_ANALYSIS_QUEUE,
  async (job: Job<HighlightPairJob>) => {
    const { cam1Filename, cam2Filename, cam3Filename, generationId } = job.data;
    await markTaskProcessing(generationId, "highlight-analysis", job.id);
    console.log(
      `[${WORKER_NAME}] job ${job.id} → analyzing "${cam1Filename}" + "${cam2Filename}" + "${cam3Filename}"`
    );

    const heartbeat = startHeartbeat({ generationId, taskType: "highlight-analysis", jobId: job.id });
    let analysis;
    try {
      analysis = await analyzeHighlightSegments(cam1Filename, cam2Filename, cam3Filename);
      await heartbeat.stop();
    } catch (err) {
      await heartbeat.stop();
      throw err;
    }

    console.log(
      `[${WORKER_NAME}] job ${job.id} done: "${analysis.title}" — ${analysis.segments.length} segment(s)`
    );
    for (const segment of analysis.segments) {
      console.log(
        `[${WORKER_NAME}]   cam${segment.camera} ` +
          `${segment.start.toFixed(1)}s–${segment.end.toFixed(1)}s: ${segment.reason}`
      );
    }

    // Chain into stage 2 now that the segments are known.
    await enqueueHighlightReel(cam1Filename, cam2Filename, cam3Filename, analysis, generationId);
    await markTaskCompleted(generationId, "highlight-analysis");

    return {
      title: analysis.title,
      segments: analysis.segments.length,
    };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Gemini upload + inference is the expensive part; one session at a time.
    concurrency: 1,
    // A long take can spend minutes in Gemini alone.
    lockDuration: LOCK_DURATION_MS,
  }
);

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${HIGHLIGHT_ANALYSIS_QUEUE}"`);
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
    "highlight-analysis",
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
