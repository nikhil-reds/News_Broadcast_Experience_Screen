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

const WORKER_NAME = "green-screen-compose-worker";

const worker = new Worker<GreenScreenJob>(
  GREEN_SCREEN_QUEUE,
  async (job: Job<GreenScreenJob>) => {
    const { backgroundId, sourceFilename } = job.data;

    const background = findBackground(backgroundId);
    if (!background) {
      throw new Error(`Unknown background id "${backgroundId}"`);
    }

    console.log(
      `[${WORKER_NAME}] job ${job.id} → compositing "${sourceFilename}" onto "${backgroundId}"`
    );

    const workDir = await mkdtemp(join(tmpdir(), "green-screen-"));
    try {
      const sourcePath = join(workDir, "source.mp4");
      await downloadObjectToFile(VIDEO_BUCKET, sourceFilename, sourcePath);

      const outputPath = join(workDir, "output.mp4");
      await composeGreenScreenBackground({
        input: sourcePath,
        backgroundImage: backgroundImagePath(backgroundId),
        output: outputPath,
      });

      const outputFilename = composedFilename(backgroundId, sourceFilename);
      const bytes = await readFile(outputPath);
      await uploadObject(VIDEO_BUCKET, outputFilename, bytes, "video/mp4");

      const url = composedOutputUrl(backgroundId, sourceFilename);
      console.log(`[${WORKER_NAME}] job ${job.id} done → ${url}`);

      return { backgroundId, sourceFilename, url };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // One ffmpeg pass at a time keeps this predictable on the studio machine;
    // results are cached per (background, take) anyway, so this only runs at
    // all the first time a given swatch is clicked against a given take.
    concurrency: 1,
    lockDuration: 5 * 60 * 1000,
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
worker.on("failed", (job, err) => {
  console.error(`[${WORKER_NAME}] ❌ job ${job?.id} failed: ${describeError(err)}`);
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
