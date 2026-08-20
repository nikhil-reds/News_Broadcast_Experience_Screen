/**
 * Green-Screen Compose Worker
 * ----------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:green-screen    # tsx app/worker/green-screen-compose.ts
 *
 * Flow: Screen 07 polls camera 1 for its latest take and shows a grid of
 * background swatches. Clicking one hits POST /api/green-screen/compose,
 * which enqueues a job here (or returns the cached result if this exact
 * (background, take) pair was already rendered). This worker downloads that
 * camera-1 take from the MinIO `videos` bucket, chromakeys it onto the chosen
 * background with ffmpeg, and uploads the result back to `videos` under a
 * `greenscreen-<backgroundId>-<take>.mp4` key — which the page polls for via
 * GET /api/green-screen/compose/[jobId] and then swaps into the <video>. A
 * new recording gets its own cache key, so nothing here goes stale silently.
 *
 * Requires ffmpeg on PATH (or FFMPEG_PATH pointing at it — see .env).
 */
import "dotenv/config";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { GREEN_SCREEN_QUEUE, type GreenScreenJob } from "@/lib/queue";
import { composeGreenScreenBackground } from "@/lib/ffmpeg";
import { VIDEO_BUCKET, downloadObjectToFile, uploadObject } from "@/lib/minio";
import { composedFilename, composedOutputUrl, findBackground } from "@/lib/green-screen";
import { backgroundImagePath } from "@/lib/green-screen-paths";
import { markTaskProcessing, markTaskCompleted, markTaskFailed, publishVariant, failVariant } from "@/lib/generation";
import { startHeartbeat } from "@/lib/generation-heartbeat";

// Same env-var-override convention as FFMPEG_EXPORT_TIMEOUT_MS (lib/video-export.ts).
const FFMPEG_GREENSCREEN_TIMEOUT_MS = parseInt(process.env.FFMPEG_GREENSCREEN_TIMEOUT_MS || String(5 * 60 * 1000), 10);

/**
 * Screen 07 is the only consumer of this worker's output as a CURRENT/NEXT
 * "variant" (which single background is actively displayed) rather than a
 * base task everyone waits on together — see lib/generation.ts's
 * VARIANT_SCREENS comment. This job's payload doesn't carry a screenId
 * (the same queue also serves the "prewarm all 5 backgrounds" call from
 * save-recording, which has no screen in mind at all), so publishVariant/
 * failVariant are called unconditionally below — they internally no-op
 * unless Screen 07's ScreenPublication.pendingParams actually matches this
 * exact (generationId, backgroundId), so a prewarm job harmlessly no-ops too.
 */
const SCREEN_7 = 7;

const WORKER_NAME = "green-screen-compose-worker";

const worker = new Worker<GreenScreenJob>(
  GREEN_SCREEN_QUEUE,
  async (job: Job<GreenScreenJob>) => {
    const { backgroundId, sourceFilename, generationId } = job.data;
    await markTaskProcessing(generationId, `greenscreen-${backgroundId}`, job.id);

    const background = findBackground(backgroundId);
    if (!background) {
      throw new Error(`Unknown background id "${backgroundId}"`);
    }

    console.log(
      `[${WORKER_NAME}] job ${job.id} → compositing "${sourceFilename}" onto "${backgroundId}"`
    );

    const heartbeat = startHeartbeat({ generationId, taskType: `greenscreen-${backgroundId}`, jobId: job.id });
    const workDir = await mkdtemp(join(tmpdir(), "green-screen-"));
    try {
      const sourcePath = join(workDir, "source.mp4");
      await downloadObjectToFile(VIDEO_BUCKET, sourceFilename, sourcePath);

      const outputPath = join(workDir, "output.mp4");
      await composeGreenScreenBackground({
        input: sourcePath,
        backgroundImage: backgroundImagePath(backgroundId),
        output: outputPath,
        timeoutMs: FFMPEG_GREENSCREEN_TIMEOUT_MS,
        onHeartbeat: (pid) => heartbeat.touch(undefined, `ffmpeg pid ${pid}`),
      });

      const outputFilename = composedFilename(backgroundId, sourceFilename);
      const bytes = await readFile(outputPath);
      await uploadObject(VIDEO_BUCKET, outputFilename, bytes, "video/mp4");

      const url = composedOutputUrl(backgroundId, sourceFilename);
      console.log(`[${WORKER_NAME}] job ${job.id} done → ${url}`);

      await markTaskCompleted(generationId, `greenscreen-${backgroundId}`);
      if (generationId) {
        await publishVariant(SCREEN_7, generationId, { backgroundId }, { videoUrl: url });
      }

      return { backgroundId, sourceFilename, url };
    } finally {
      await heartbeat.stop();
      await rm(workDir, { recursive: true, force: true });
    }
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Matches BG_QUEUE_CONCURRENCY (lib/queue.ts) so all 5 backgrounds for a
    // session actually render at once — with this at 1, the queue-level
    // concurrency setting had no effect and backgrounds still rendered one
    // at a time. Results are cached per (background, take) anyway, so a
    // given (background, take) pair only ever pays for one ffmpeg pass.
    concurrency: parseInt(process.env.BG_QUEUE_CONCURRENCY || "5", 10),
    // A little above the ffmpeg pass's own timeout so a genuinely slow (not
    // stuck) composite's lock doesn't expire mid-render — see the watchdog
    // plan's note on lockDuration vs. BullMQ's native stalled-job reclaim.
    lockDuration: FFMPEG_GREENSCREEN_TIMEOUT_MS + 2 * 60 * 1000,
  }
);

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${GREEN_SCREEN_QUEUE}"`);
});
worker.on("active", (job) => {
  console.log(`[${WORKER_NAME}] processing job ${job.id}`);
});
worker.on("completed", (job) => {
  console.log(`[${WORKER_NAME}] ✅ completed job ${job.id}`);
});
worker.on("failed", async (job, err) => {
  console.error(`[${WORKER_NAME}] ❌ job ${job?.id} failed: ${describeError(err)}`);
  const attemptsMade = job?.attemptsMade ?? 1;
  const maxAttempts = job?.opts?.attempts ?? 3;
  await markTaskFailed(
    job?.data?.generationId,
    `greenscreen-${job?.data?.backgroundId}`,
    err.message,
    attemptsMade,
    maxAttempts,
    job?.id
  );
  if (job?.data?.generationId && attemptsMade >= maxAttempts) {
    await failVariant(SCREEN_7, job.data.generationId, { backgroundId: job.data.backgroundId }, err.message);
  }
});
worker.on("error", (err) => {
  console.error(`[${WORKER_NAME}] worker error: ${describeError(err)}`);
});

/**
 * `err.message` is empty for Node's AggregateError (e.g. ioredis failing to
 * connect — Redis not running is the usual cause) since it never sets a
 * top-level message, only `.errors[]`. Without this, those show up as blank
 * "worker error: " lines with no way to tell what actually happened.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const aggregate = err as Error & { errors?: unknown[]; code?: string };
    if (Array.isArray(aggregate.errors) && aggregate.errors.length > 0) {
      return aggregate.errors.map((e) => describeError(e)).join("; ");
    }
    return `${err.message || err.name}${aggregate.code ? ` (${aggregate.code})` : ""}`;
  }
  return String(err);
}

async function shutdown() {
  console.log(`[${WORKER_NAME}] shutting down…`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
