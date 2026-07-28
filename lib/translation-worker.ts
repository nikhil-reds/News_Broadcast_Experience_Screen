import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { translateSegmentTexts } from "@/lib/qwen";
import { persistTranslation } from "@/lib/transcript-language";
import type { TranslationJob } from "@/lib/queue";

export interface TranslationWorkerOptions {
  /** Queue name, e.g. "german-transcript". */
  queue: string;
  /** Human language name passed to Qwen, e.g. "German". */
  language: string;
  /** Short suffix used in the saved MinIO object key, e.g. "de". */
  langCode: string;
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
      const { filename, transcriptId, segments } = job.data;
      console.log(`[${workerName}] job ${job.id} → translating "${filename}" to ${opts.language}`);

      const translatedTexts = await translateSegmentTexts(
        segments.map((s) => s.text),
        opts.language
      );

      const translation = await persistTranslation({
        transcriptId,
        language: opts.language,
        langCode: opts.langCode,
        filename,
        segments,
        translatedTexts,
      });

      console.log(`[${workerName}] job ${job.id} done → ${translation.url}`);
      return { langCode: opts.langCode, url: translation.url, objectKey: translation.objectKey };
    },
    {
      name: workerName,
      connection: redisConnection,
      concurrency: 1,
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
  worker.on("failed", (job, err) => {
    console.error(`[${workerName}] ❌ job ${job?.id} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[${workerName}] worker error: ${err.message}`);
  });

  return worker;
}
