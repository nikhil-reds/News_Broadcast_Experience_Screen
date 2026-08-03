/**
 * Green-Screen Compose Worker
 * ----------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:green-screen    # tsx app/worker/green-screen-compose.ts
 *
 * Flow: Screen 07 shows the studio's green-screen take plus a grid of
 * background swatches. Clicking one hits POST /api/green-screen/compose,
 * which enqueues a job here (or returns the cached result if this background
 * was already rendered once). This worker chromakeys the take onto the
 * chosen background with ffmpeg and writes the result to
 * public/generated/green-screen/<backgroundId>.mp4, which the page polls for
 * via GET /api/green-screen/compose/[jobId] and then swaps into the <video>.
 *
 * Requires ffmpeg on PATH (or FFMPEG_PATH pointing at it — see .env).
 */
import "dotenv/config";
import { mkdir, rename, rm } from "node:fs/promises";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { GREEN_SCREEN_QUEUE, type GreenScreenJob } from "@/lib/queue";
import { composeGreenScreenBackground } from "@/lib/ffmpeg";
import { composedOutputUrl, findBackground } from "@/lib/green-screen";
import {
  backgroundImagePath,
  composedOutputDir,
  composedOutputPath,
  sourceVideoPath,
} from "@/lib/green-screen-paths";

const WORKER_NAME = "green-screen-compose-worker";

const worker = new Worker<GreenScreenJob>(
  GREEN_SCREEN_QUEUE,
  async (job: Job<GreenScreenJob>) => {
    const { backgroundId } = job.data;

    const background = findBackground(backgroundId);
    if (!background) {
      throw new Error(`Unknown background id "${backgroundId}"`);
    }

    console.log(`[${WORKER_NAME}] job ${job.id} → compositing onto "${backgroundId}"`);

    await mkdir(composedOutputDir(), { recursive: true });

    const output = composedOutputPath(backgroundId);
    // ffmpeg (with -y) creates/truncates its output file the instant it
    // starts, not when it finishes — so writing straight to `output` leaves
    // a half-encoded file sitting at the exact path the API's cache check
    // looks for. A request landing mid-render would see "exists" and get
    // handed a broken video. Render to a scratch path instead and rename
    // into place atomically only once ffmpeg has actually finished, so
    // `output` never exists in a partial state. Keeps the .mp4 extension —
    // ffmpeg picks its container/muxer from the output filename, so a
    // scratch name without it (e.g. "<output>.part") fails to even start.
    const scratch = output.replace(/\.mp4$/, `.${job.id}.part.mp4`);
    try {
      await composeGreenScreenBackground({
        input: sourceVideoPath(),
        backgroundImage: backgroundImagePath(backgroundId),
        output: scratch,
      });
      await rename(scratch, output);
    } catch (err) {
      await rm(scratch, { force: true });
      throw err;
    }

    const url = composedOutputUrl(backgroundId);
    console.log(`[${WORKER_NAME}] job ${job.id} done → ${url}`);

    return { backgroundId, url };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // One ffmpeg pass at a time keeps this predictable on the studio machine;
    // results are cached per background anyway, so this only runs at all the
    // first time a given swatch is clicked.
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
