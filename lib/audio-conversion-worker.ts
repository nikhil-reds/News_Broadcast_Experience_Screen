import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { TTS_AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { synthesizeGeminiSpeech } from "@/lib/gemini-tts";
import type { AudioConversionJob } from "@/lib/queue";
import { markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { withHeartbeat } from "@/lib/generation-heartbeat";

export interface AudioConversionWorkerOptions {
  /** Queue name, e.g. "german-audio". */
  queue: string;
  /** Human language name, e.g. "German" (used only for logging here). */
  language: string;
  /** Short suffix used in the saved MinIO object key, e.g. "de". */
  langCode: string;
}

/**
 * Bounds the CosyVoice TTS call so a hung request throws instead of sitting
 * forever. A throw here is what lets BullMQ's existing attempts/backoff
 * actually retry a wedged call; see app/worker/watchdog.ts for the
 * stuck-job detector this pairs with.
 */
export const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || String(3 * 60 * 1000), 10);

/**
 * Same AbortController-timeout shape as lib/transcribe.ts's Whisper timeout,
 * adapted for synthesizeGeminiSpeech()'s underlying CosyVoice call, which
 * doesn't expose its own AbortSignal to callers — races it against a timer
 * instead so a hung call still throws a clear, bounded error.
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
      const { translationId, filename, langCode, text, generationId } = job.data;
      await markTaskProcessing(generationId, `tts-${opts.langCode}`, job.id);
      console.log(`[${workerName}] job ${job.id} → synthesizing "${filename}" (${opts.language})`);

      const synthesizedWav = await withHeartbeat(
        { generationId, taskType: `tts-${opts.langCode}`, jobId: job.id },
        () =>
          withTimeout(
            () => synthesizeGeminiSpeech(text),
            TTS_TIMEOUT_MS,
            `CosyVoice speech synthesis timed out after ${Math.round(TTS_TIMEOUT_MS / 60000)} minutes`
          )
      );

      const objectKey = `${filename}.${langCode}.wav`;
      await uploadObject(TTS_AUDIO_BUCKET, objectKey, synthesizedWav, "audio/wav");
      const url = `/api/asset/${TTS_AUDIO_BUCKET}/${encodeURIComponent(objectKey)}`;

      await prisma.translationAudio.upsert({
        where: { translationId },
        create: {
          translationId,
          generationId,
          language: opts.language,
          langCode,
          bucket: TTS_AUDIO_BUCKET,
          objectKey,
          url,
          size: synthesizedWav.length,
        },
        update: { generationId, objectKey, url, size: synthesizedWav.length },
      });

      await markTaskCompleted(generationId, `tts-${opts.langCode}`);

      console.log(`[${workerName}] job ${job.id} done → ${url}`);
      return { langCode, url, objectKey };
    },
    {
      name: workerName,
      connection: redisConnection,
      concurrency: 1,
      // A little above the CosyVoice call's own timeout so a genuinely slow
      // (not stuck) synthesis's lock doesn't expire mid-call — see the
      // watchdog plan's note on lockDuration vs. BullMQ's native
      // stalled-job reclaim.
      lockDuration: TTS_TIMEOUT_MS + 2 * 60 * 1000,
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
      `tts-${opts.langCode}`,
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
