import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { translateSegmentTexts } from "@/lib/translation";
import { persistTranslation } from "@/lib/transcript-language";
import type { TranslationJob } from "@/lib/queue";
import { markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { withHeartbeat } from "@/lib/generation-heartbeat";

export interface TranslationWorkerOptions {
  /** Queue name, e.g. "german-transcript". */
  queue: string;
  /** Human language name passed to Gemini, e.g. "German". */
  language: string;
  /** Short suffix used in the saved MinIO object key, e.g. "de". */
  langCode: string;
}

/**
 * Bounds the Qwen translation call so a hung request throws instead of
 * sitting forever — this is a text call, so it should be much faster than
 * the audio/video work elsewhere in the pipeline. A throw here is what lets
 * BullMQ's existing attempts/backoff actually retry a wedged call; see
 * app/worker/watchdog.ts for the stuck-job detector this pairs with.
 */
export const TRANSLATION_TIMEOUT_MS = parseInt(
  process.env.TRANSLATION_TIMEOUT_MS || String(3 * 60 * 1000),
  10
);

/**
 * Same AbortController-timeout shape as lib/transcribe.ts's Whisper timeout,
 * adapted for translateSegmentTexts()'s underlying Qwen call, which doesn't
 * expose its own AbortSignal to callers — races it against a timer instead
 * so a hung call still throws a clear, bounded error.
 */
function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return new Promise<T>((resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error(timeoutMessage)));
    fn().then(resolve, reject);
  }).finally(() => clearTimeout(timeoutId));
}

/**
 * Shared factory for the 4 per-language translation workers. Each consumes
 * jobs from its own queue (one saved English transcript's segments per job),
 * translates them via Qwen preserving per-segment timing, saves the joined
 * result as `<filename>.<langCode>.txt` in the MinIO `transcripts` bucket, and
 * persists a TranscriptTranslation + its segments (via the same
 * `persistTranslation` helper the on-demand `/api/transcript/<language>`
 * routes use, so both paths produce identical, compatible data).
 */
export function startTranslationWorker(opts: TranslationWorkerOptions): Worker<TranslationJob> {
  const workerName = `${opts.queue}-worker`;

  const worker = new Worker<TranslationJob>(
    opts.queue,
    async (job: Job<TranslationJob>) => {
      const { filename, transcriptId, segments, generationId } = job.data;
      await markTaskProcessing(generationId, `translation-${opts.langCode}`, job.id);
      console.log(`[${workerName}] job ${job.id} → translating "${filename}" to ${opts.language}`);

      const translatedTexts = await withHeartbeat(
        { generationId, taskType: `translation-${opts.langCode}`, jobId: job.id },
        () =>
          withTimeout(
            () => translateSegmentTexts(segments.map((s) => s.text), opts.language),
            TRANSLATION_TIMEOUT_MS,
            `Qwen translation timed out after ${Math.round(TRANSLATION_TIMEOUT_MS / 60000)} minutes`
          )
      );

      const translation = await persistTranslation({
        transcriptId,
        language: opts.language,
        langCode: opts.langCode,
        filename,
        segments,
        translatedTexts,
        generationId,
      });

      await markTaskCompleted(generationId, `translation-${opts.langCode}`);

      console.log(`[${workerName}] job ${job.id} done → ${translation.url}`);
      return { langCode: opts.langCode, url: translation.url, objectKey: translation.objectKey };
    },
    {
      name: workerName,
      connection: redisConnection,
      concurrency: 1,
      // A little above the Qwen call's own timeout so a genuinely slow (not
      // stuck) translation's lock doesn't expire mid-call — see the watchdog
      // plan's note on lockDuration vs. BullMQ's native stalled-job reclaim.
      lockDuration: TRANSLATION_TIMEOUT_MS + 2 * 60 * 1000,
    }
  );

  worker.on("ready", () => {
    console.log(`[${workerName}] ready and listening on queue "${opts.queue}"`);
  });
  worker.on("active", (job) => {
    console.log(`[${workerName}] processing job ${job.id} (${job.data.filename})`);
  });
  worker.on("completed", (job) => {
    console.log(`[${workerName}] ✅ completed job ${job.id}`);
  });
  worker.on("failed", async (job, err) => {
    console.error(`[${workerName}] ❌ job ${job?.id} failed: ${err.message}`);
    await markTaskFailed(
      job?.data?.generationId,
      `translation-${opts.langCode}`,
      err.message,
      job?.attemptsMade ?? 1,
      job?.opts?.attempts ?? 3,
      job?.id
    );
  });
  worker.on("error", (err) => {
    console.error(`[${workerName}] worker error: ${err.message}`);
  });

  return worker;
}
