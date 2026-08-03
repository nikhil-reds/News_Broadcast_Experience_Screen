import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { TTS_AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { synthesizeGeminiSpeech } from "@/lib/gemini-tts";
import type { AudioConversionJob } from "@/lib/queue";

export interface AudioConversionWorkerOptions {
  /** Queue name, e.g. "german-audio". */
  queue: string;
  /** Human language name, e.g. "German" (used only for logging here). */
  language: string;
  /** Short suffix used in the saved MinIO object key, e.g. "de". */
  langCode: string;
}

/**
 * Shared factory for the per-language TTS workers. Each consumes jobs from
 * its own queue — one already-persisted translation per job — synthesizes
 * the translated text via Gemini's TTS model (no voice cloning; Gemini
 * speaks with its own preset voice and picks up the target language from the
 * text itself), saves the result as `<filename>.<langCode>.wav` in the MinIO
 * `tts-audio` bucket, and upserts a TranslationAudio row.
 */
export function startAudioConversionWorker(
  opts: AudioConversionWorkerOptions
): Worker<AudioConversionJob> {
  const workerName = `${opts.queue}-worker`;

  const worker = new Worker<AudioConversionJob>(
    opts.queue,
    async (job: Job<AudioConversionJob>) => {
      const { translationId, filename, langCode, text } = job.data;
      console.log(`[${workerName}] job ${job.id} → synthesizing "${filename}" (${opts.language})`);

      const synthesizedWav = await synthesizeGeminiSpeech(text);

      const objectKey = `${filename}.${langCode}.wav`;
      await uploadObject(TTS_AUDIO_BUCKET, objectKey, synthesizedWav, "audio/wav");
      const url = `/api/asset/${TTS_AUDIO_BUCKET}/${encodeURIComponent(objectKey)}`;

      await prisma.translationAudio.upsert({
        where: { translationId },
        create: {
          translationId,
          language: opts.language,
          langCode,
          bucket: TTS_AUDIO_BUCKET,
          objectKey,
          url,
          size: synthesizedWav.length,
        },
        update: { objectKey, url, size: synthesizedWav.length },
      });

      console.log(`[${workerName}] job ${job.id} done → ${url}`);
      return { langCode, url, objectKey };
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
