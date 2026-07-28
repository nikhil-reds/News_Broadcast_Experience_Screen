/**
 * Audio Transcription Worker
 * ---------------------------
 * A standalone BullMQ worker (run separately from the Next.js server):
 *
 *     npm run worker            # tsx app/worker/transcripts.ts
 *
 * Flow: audio is recorded -> POST /api/save-audio stores it in the MinIO
 * `audio` bucket and enqueues a job on the `audio-transcription` queue.
 * This worker consumes each job, runs Docker Faster-Whisper on the audio,
 * writes the English transcript `.txt` into the MinIO `transcripts` bucket,
 * and persists the transcript + segments to Postgres.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { TRANSCRIPTION_QUEUE, type TranscriptionJob } from "@/lib/queue";
import { transcribeAndStore } from "@/lib/transcribe";

const WORKER_NAME = "audio-transcription-worker";

const worker = new Worker<TranscriptionJob>(
  TRANSCRIPTION_QUEUE,
  async (job: Job<TranscriptionJob>) => {
    const { filename } = job.data;
    console.log(`[${WORKER_NAME}] job ${job.id} → transcribing "${filename}"`);

    const result = await transcribeAndStore(filename);

    console.log(
      `[${WORKER_NAME}] job ${job.id} done: ${result.segments.length} segment(s), ` +
        `English txt → ${result.txtUrl}`
    );

    return {
      filename: result.filename,
      transcriptId: result.transcriptId,
      txtObjectKey: result.txtObjectKey,
      txtUrl: result.txtUrl,
      segments: result.segments.length,
      sttEngine: result.sttEngine,
    };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    concurrency: 1, // Whisper on CPU is heavy; process one clip at a time.
  }
);

worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${TRANSCRIPTION_QUEUE}"`);
});
worker.on("active", (job) => {
  console.log(`[${WORKER_NAME}] processing job ${job.id} (${job.data.filename})`);
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
