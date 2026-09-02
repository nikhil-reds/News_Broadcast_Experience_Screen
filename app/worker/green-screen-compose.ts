/**
 * Green-Screen Compose Worker
 * ----------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker:green-screen    # tsx app/worker/green-screen-compose.ts
 *
 * Flow: Screen 07 polls for the latest edited highlight reel and shows a grid
 * of background swatches. Clicking one hits POST /api/green-screen/compose,
 * which enqueues a job here (or returns the cached result if this exact
 * (background, edited reel) pair was already rendered). This worker downloads
 * the edited reel from the MinIO `videos` bucket, creates/reuses one local RVM
 * foreground+alpha matte for that reel, then composites the requested
 * background with ffmpeg. If RVM is unavailable or validation fails, the job
 * explicitly logs/returns a chromakey fallback instead of pretending the matte
 * path succeeded.
 *
 * Requires ffmpeg on PATH (or FFMPEG_PATH pointing at it — see .env). RVM also
 * needs Python dependencies from tools/rvm/requirements.txt when
 * GREEN_SCREEN_ENGINE=rvm.
 */
import "dotenv/config";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { GREEN_SCREEN_QUEUE, type GreenScreenJob } from "@/lib/queue";
import { composeGreenScreenBackground, composeMattedForegroundBackground } from "@/lib/ffmpeg";
import { VIDEO_BUCKET, downloadObjectToFile, objectExists, uploadObject } from "@/lib/minio";
import {
  composedFilename,
  composedMetadataFilename,
  composedOutputUrl,
  findBackground,
  matteAlphaFilename,
  matteForegroundFilename,
  matteMetadataFilename,
} from "@/lib/green-screen";
import { backgroundImagePath } from "@/lib/green-screen-paths";
import { markTaskProcessing, markTaskCompleted, markTaskFailed, publishVariant, failVariant } from "@/lib/generation";
import { startHeartbeat } from "@/lib/generation-heartbeat";
import { runRvmMatting, validateMatteFiles } from "@/lib/video-matting";

// Same env-var-override convention as FFMPEG_EXPORT_TIMEOUT_MS (lib/video-export.ts).
const FFMPEG_GREENSCREEN_TIMEOUT_MS = parseInt(process.env.FFMPEG_GREENSCREEN_TIMEOUT_MS || String(5 * 60 * 1000), 10);
const GREEN_SCREEN_ENGINE = process.env.GREEN_SCREEN_ENGINE || "rvm";
const GREEN_SCREEN_FALLBACK_CHROMAKEY = (process.env.GREEN_SCREEN_FALLBACK_CHROMAKEY || "true") !== "false";
const MATTE_WAIT_TIMEOUT_MS = parseInt(process.env.RVM_MATTE_WAIT_TIMEOUT_MS || String(60 * 1000), 10);
const MATTE_LOCK_TTL_MS = MATTE_WAIT_TIMEOUT_MS + 2 * 60 * 1000;

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

    console.log(`[${WORKER_NAME}] job ${job.id} → compositing edited reel "${sourceFilename}" onto "${backgroundId}"`);

    const heartbeat = startHeartbeat({ generationId, taskType: `greenscreen-${backgroundId}`, jobId: job.id });
    const workDir = await mkdtemp(join(tmpdir(), "green-screen-"));
    try {
      const sourcePath = join(workDir, "source.mp4");
      await downloadObjectToFile(VIDEO_BUCKET, sourceFilename, sourcePath);

      const outputPath = join(workDir, "output.mp4");
      const fallbackReason = await tryComposeWithRvm({
        sourceFilename,
        sourcePath,
        workDir,
        backgroundId,
        outputPath,
        onHeartbeat: (pid) => heartbeat.touch(undefined, `media pid ${pid}`),
      });

      const outputFilename = composedFilename(backgroundId, sourceFilename);
      const bytes = await readFile(outputPath);
      await uploadObject(VIDEO_BUCKET, outputFilename, bytes, "video/mp4");
      await uploadObject(
        VIDEO_BUCKET,
        composedMetadataFilename(backgroundId, sourceFilename),
        Buffer.from(
          JSON.stringify(
            {
              engine: fallbackReason ? "chromakey" : "rvm",
              fallback: fallbackReason ? "chromakey" : null,
              fallbackReason,
              sourceFilename,
              backgroundId,
              createdAt: new Date().toISOString(),
            },
            null,
            2
          ),
          "utf-8"
        ),
        "application/json"
      );

      const url = composedOutputUrl(backgroundId, sourceFilename);
      console.log(
        `[${WORKER_NAME}] job ${job.id} done${fallbackReason ? ` via FALLBACK_CHROMAKEY (${fallbackReason})` : ""} → ${url}`
      );

      await markTaskCompleted(generationId, `greenscreen-${backgroundId}`);
      if (generationId) {
        await publishVariant(SCREEN_7, generationId, { backgroundId }, { videoUrl: url });
      }

      return { backgroundId, sourceFilename, url, fallback: fallbackReason ? "chromakey" : null, fallbackReason };
    } finally {
      await heartbeat.stop();
      await rm(workDir, { recursive: true, force: true });
    }
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Matches BG_QUEUE_CONCURRENCY (lib/queue.ts) so all 5 backgrounds can be
    // prepared together. A Redis matte lock keeps RVM itself at one pass per
    // edited reel; sibling jobs wait for that cache and then do cheap ffmpeg
    // composites.
    concurrency: parseInt(process.env.BG_QUEUE_CONCURRENCY || "5", 10),
    // A little above the ffmpeg pass's own timeout so a genuinely slow (not
    // stuck) composite's lock doesn't expire mid-render — see the watchdog
    // plan's note on lockDuration vs. BullMQ's native stalled-job reclaim.
    lockDuration: FFMPEG_GREENSCREEN_TIMEOUT_MS + 2 * 60 * 1000,
  }
);

async function tryComposeWithRvm(opts: {
  sourceFilename: string;
  sourcePath: string;
  workDir: string;
  backgroundId: string;
  outputPath: string;
  onHeartbeat: (pid: number) => void;
}): Promise<string | null> {
  const { sourceFilename, sourcePath, workDir, backgroundId, outputPath, onHeartbeat } = opts;
  const fallback = async (reason: string) => {
    if (!GREEN_SCREEN_FALLBACK_CHROMAKEY) {
      throw new Error(`MATTE_FAILED: ${reason}`);
    }
    console.warn(`[${WORKER_NAME}] FALLBACK_CHROMAKEY for "${sourceFilename}": ${reason}`);
    await composeGreenScreenBackground({
      input: sourcePath,
      backgroundImage: backgroundImagePath(backgroundId),
      output: outputPath,
      timeoutMs: FFMPEG_GREENSCREEN_TIMEOUT_MS,
      onHeartbeat,
    });
    return reason;
  };

  if (GREEN_SCREEN_ENGINE !== "rvm") {
    return fallback(`GREEN_SCREEN_ENGINE=${GREEN_SCREEN_ENGINE}`);
  }

  const foregroundPath = join(workDir, "foreground.mkv");
  const alphaPath = join(workDir, "alpha.mkv");
  const metadataPath = join(workDir, "metadata.json");
  const foregroundKey = matteForegroundFilename(sourceFilename);
  const alphaKey = matteAlphaFilename(sourceFilename);
  const metadataKey = matteMetadataFilename(sourceFilename);

  try {
    await ensureRvmMatte({
      sourceFilename,
      sourcePath,
      foregroundPath,
      alphaPath,
      metadataPath,
      foregroundKey,
      alphaKey,
      metadataKey,
      onHeartbeat,
    });

    await composeMattedForegroundBackground({
      foregroundVideo: foregroundPath,
      alphaVideo: alphaPath,
      sourceAudio: sourcePath,
      backgroundImage: backgroundImagePath(backgroundId),
      output: outputPath,
      timeoutMs: FFMPEG_GREENSCREEN_TIMEOUT_MS,
      onHeartbeat,
    });
    return null;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return fallback(reason);
  }
}

async function ensureRvmMatte(opts: {
  sourceFilename: string;
  sourcePath: string;
  foregroundPath: string;
  alphaPath: string;
  metadataPath: string;
  foregroundKey: string;
  alphaKey: string;
  metadataKey: string;
  onHeartbeat: (pid: number) => void;
}): Promise<void> {
  if (await matteCacheExists(opts.foregroundKey, opts.alphaKey, opts.metadataKey)) {
    await downloadCachedMatte(opts);
    return;
  }

  const lockKey = `rvm-matte-lock:${opts.sourceFilename}`;
  const failureKey = `rvm-matte-failed:${opts.sourceFilename}`;
  const lockToken = randomUUID();
  const lockAcquired = await redisConnection.set(lockKey, lockToken, "PX", MATTE_LOCK_TTL_MS, "NX");

  if (lockAcquired === "OK") {
    try {
      await redisConnection.del(failureKey);
      console.log(`[${WORKER_NAME}] MATTE_PROCESSING "${opts.sourceFilename}"`);
      await runRvmMatting({
        input: opts.sourcePath,
        foreground: opts.foregroundPath,
        alpha: opts.alphaPath,
        metadata: opts.metadataPath,
        onHeartbeat: opts.onHeartbeat,
      });
      console.log(`[${WORKER_NAME}] VALIDATING_ALPHA "${opts.sourceFilename}"`);
      await validateMatteFiles({
        source: opts.sourcePath,
        foreground: opts.foregroundPath,
        alpha: opts.alphaPath,
        metadata: opts.metadataPath,
      });
      await uploadObject(VIDEO_BUCKET, opts.foregroundKey, await readFile(opts.foregroundPath), "video/x-matroska");
      await uploadObject(VIDEO_BUCKET, opts.alphaKey, await readFile(opts.alphaPath), "video/x-matroska");
      await uploadObject(VIDEO_BUCKET, opts.metadataKey, await readFile(opts.metadataPath), "application/json");
      console.log(`[${WORKER_NAME}] MATTE_READY "${opts.sourceFilename}"`);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await redisConnection.set(failureKey, reason, "PX", 10 * 60 * 1000);
      throw err;
    } finally {
      const currentToken = await redisConnection.get(lockKey);
      if (currentToken === lockToken) {
        await redisConnection.del(lockKey);
      }
    }
  }

  console.log(`[${WORKER_NAME}] MATTE_PENDING "${opts.sourceFilename}"`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < MATTE_WAIT_TIMEOUT_MS) {
    await sleep(1500);
    const failureReason = await redisConnection.get(failureKey);
    if (failureReason) {
      throw new Error(failureReason);
    }
    if (await matteCacheExists(opts.foregroundKey, opts.alphaKey, opts.metadataKey)) {
      await downloadCachedMatte(opts);
      return;
    }
  }

  throw new Error(`Timed out waiting for cached RVM matte for "${opts.sourceFilename}"`);
}

async function matteCacheExists(foregroundKey: string, alphaKey: string, metadataKey: string): Promise<boolean> {
  const [foreground, alpha, metadata] = await Promise.all([
    objectExists(VIDEO_BUCKET, foregroundKey),
    objectExists(VIDEO_BUCKET, alphaKey),
    objectExists(VIDEO_BUCKET, metadataKey),
  ]);
  return foreground && alpha && metadata;
}

async function downloadCachedMatte(opts: {
  foregroundPath: string;
  alphaPath: string;
  metadataPath: string;
  foregroundKey: string;
  alphaKey: string;
  metadataKey: string;
}): Promise<void> {
  await Promise.all([
    downloadObjectToFile(VIDEO_BUCKET, opts.foregroundKey, opts.foregroundPath),
    downloadObjectToFile(VIDEO_BUCKET, opts.alphaKey, opts.alphaPath),
    downloadObjectToFile(VIDEO_BUCKET, opts.metadataKey, opts.metadataPath),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
