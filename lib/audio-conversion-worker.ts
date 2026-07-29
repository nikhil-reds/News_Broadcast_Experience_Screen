import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, TTS_AUDIO_BUCKET, getObjectBuffer, uploadObject } from "@/lib/minio";
import { synthesizeCrossLingual } from "@/lib/cosyvoice";
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
 * Shared factory for the 4 per-language TTS workers. Each consumes jobs from
 * its own queue — one already-persisted translation per job — clones the
 * voice from that broadcast's ORIGINAL recorded audio (CosyVoice 2
 * cross-lingual mode, since CosyVoice has no built-in preset speaker for
 * German/Hindi/French/Spanish) speaking the translated text, saves the result
 * as `<filename>.<langCode>.wav` in the MinIO `tts-audio` bucket, and upserts
 * a TranslationAudio row.
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

      const translation = await prisma.transcriptTranslation.findUnique({
        where: { id: translationId },
        include: { transcript: { include: { audioFile: true } } },
      });
      const originalFilename = translation?.transcript?.audioFile?.filename;
      if (!originalFilename) {
        throw new Error(`No original AudioFile found for translation ${translationId}`);
      }

      // Use the broadcast's own original recording as the CosyVoice voice
      // reference (cross-lingual cloning), so every language sounds like the
      // same anchor.
      const promptWav = await getObjectBuffer(AUDIO_BUCKET, originalFilename);
      const synthesizedWav = await synthesizeCrossLingual(text, promptWav);

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
