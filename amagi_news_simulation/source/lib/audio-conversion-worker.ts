import { flowProcessor } from "@/lib/flow-lifecycle";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { TTS_AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { concatWav, synthesizeChatterbox, type ChatterboxLanguage } from "@/lib/chatterbox";
import { splitTtsText } from "@/lib/tts-chunking";
import type { AudioConversionJob } from "@/lib/queue";
import { markTaskProcessing, markTaskCompleted, markTaskFailed } from "@/lib/generation";
import { withHeartbeat } from "@/lib/generation-heartbeat";
import { attachWorkerHealth } from "@/lib/worker-health";
import { DEFAULT_VOICE_ID, CHATTERBOX_REVISION, isVoiceId, voiceProfile, voiceTaskType } from "@/lib/voice-profiles";
import { voiceCacheKey } from "@/lib/voice-cache";

export interface AudioConversionWorkerOptions { queue: string; language: string; langCode: string; }
export const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 20 * 60 * 1000);

export function startAudioConversionWorker(opts: AudioConversionWorkerOptions): Worker<AudioConversionJob> {
  const workerName = `${opts.queue}-worker`;
  const worker = new Worker<AudioConversionJob>(opts.queue, flowProcessor(async (job: Job<AudioConversionJob>) => {
    const { translationId, text, generationId, langCode } = job.data;
    const voiceId = job.data.voiceId ?? DEFAULT_VOICE_ID;
    if (!isVoiceId(voiceId)) throw new Error("Invalid voice profile");
    if (langCode !== opts.langCode) throw new Error("Language/queue mismatch");
    if (job.data.modelRevision && job.data.modelRevision !== CHATTERBOX_REVISION) throw new Error("Stale model job");
    const profile = voiceProfile(voiceId);
    const variantKey = voiceCacheKey(text, voiceId);
    const taskType = voiceTaskType(langCode, voiceId);
    await markTaskProcessing(generationId, taskType, job.id);
    const existing = await prisma.translationAudio.findUnique({
      where: { translationId_variantKey: { translationId, variantKey } },
    });
    if (existing) {
      await markTaskCompleted(generationId, taskType);
      return { langCode, voiceId, url: existing.url, objectKey: existing.objectKey };
    }
    const wav = await withHeartbeat({ generationId, taskType, jobId: job.id }, async () => {
      const chunks: Buffer[] = [];
      for (const chunk of splitTtsText(text, Number(process.env.TTS_MAX_SENTENCES_PER_CHUNK || 3))) {
        chunks.push(await synthesizeChatterbox(chunk, langCode as ChatterboxLanguage, voiceId));
      }
      return concatWav(chunks);
    });
    // Guard against overwriting a newer translation with an older text variant.
    const translation = await prisma.transcriptTranslation.findUnique({ where: { id: translationId } });
    if (!translation || translation.text !== text) throw new Error("Translation changed during synthesis; request again");
    const objectKey = `${translationId}.${langCode}.${voiceId}.${variantKey}.wav`;
    await uploadObject(TTS_AUDIO_BUCKET, objectKey, wav, "audio/wav");
    const url = `/api/asset/${TTS_AUDIO_BUCKET}/${encodeURIComponent(objectKey)}`;
    const data = {
      generationId, language: opts.language, langCode, bucket: TTS_AUDIO_BUCKET,
      objectKey, url, size: wav.length, engine: "Chatterbox-Multilingual-V3",
      voiceMode: "local-preset", speakerGender: profile.gender, voiceId,
      modelRevision: CHATTERBOX_REVISION, referenceHash: profile.referenceHash,
    };
    await prisma.translationAudio.upsert({
      where: { translationId_variantKey: { translationId, variantKey } },
      create: { translationId, variantKey, ...data }, update: data,
    });
    await markTaskCompleted(generationId, taskType);
    return { langCode, voiceId, url, objectKey };
  }), { name: workerName, connection: redisConnection, concurrency: 1, lockDuration: TTS_TIMEOUT_MS + 120000 });
  worker.on("ready", () => console.log(`[${workerName}] local V3 voice worker ready`));
  worker.on("failed", async (job, error) => {
    const id = isVoiceId(job?.data.voiceId) ? job.data.voiceId : DEFAULT_VOICE_ID;
    await markTaskFailed(job?.data.generationId, voiceTaskType(opts.langCode, id), error.message,
      job?.attemptsMade ?? 1, job?.opts?.attempts ?? 3, job?.id);
  });
  worker.on("error", (error) => console.error(`[${workerName}]`, error));
  return attachWorkerHealth(worker, { workerName, queueName: opts.queue, model: "Chatterbox Multilingual V3 local voices" });
}

