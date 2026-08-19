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
import { composeExportVideo } from "@/lib/video-export";
import { prisma } from "@/lib/prisma";

const WORKER_NAME = "video-export-worker";

const worker = new Worker<VideoExportJob>(
  VIDEO_EXPORT_QUEUE,
  async (job: Job<VideoExportJob>) => {
    const { videoJobId, reelFilename, sourceAudio, language, aspect, backgroundId } = job.data;
    console.log(
      `[${WORKER_NAME}] job ${job.id} → ${aspect} "${reelFilename}" in ${language}` +
        (backgroundId && backgroundId !== "none" ? ` onto background "${backgroundId}"` : "")
    );

    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: "processing" },
    });

    try {
      const result = await composeExportVideo({ reelFilename, sourceAudio, language, aspect, backgroundId });

      await prisma.videoJob.update({
        where: { id: videoJobId },
        data: {
          status: "completed",
          outputFilename: result.filename,
          outputUrl: result.url,
          size: result.size,
          errorMessage: null,
        },
      });

      console.log(`[${WORKER_NAME}] job ${job.id} done → ${result.url}`);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.videoJob.update({
        where: { id: videoJobId },
        data: { status: "failed", errorMessage: message },
      });
      throw err;
    }
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // ffmpeg overlay chain + re-encode is heavy; one export at a time.
    concurrency: 1,
    lockDuration: 20 * 60 * 1000,
  }
);

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
