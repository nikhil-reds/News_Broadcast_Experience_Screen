import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

/** Queue name shared by the producer (API) and the worker. */
export const TRANSCRIPTION_QUEUE = "audio-transcription";

/** Job payload: which audio object (in the MinIO `audio` bucket) to transcribe. */
export interface TranscriptionJob {
  filename: string;
}

// Cached on globalThis so Next dev hot-reload doesn't open duplicate queues.
const globalForQueue = globalThis as unknown as {
  __transcriptionQueue?: Queue<TranscriptionJob>;
};

export const transcriptionQueue =
  globalForQueue.__transcriptionQueue ??
  new Queue<TranscriptionJob>(TRANSCRIPTION_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.__transcriptionQueue = transcriptionQueue;
}

/** Enqueue a transcription job for an uploaded audio file. */
export async function enqueueTranscription(filename: string) {
  return transcriptionQueue.add("transcribe", { filename }, { jobId: `transcribe-${filename}` });
}

// ---------------------------------------------------------------------------
// Translation queues: one per language, each with its own dedicated worker.
// ---------------------------------------------------------------------------

/** One original (English) segment to translate, carrying its timing. */
export interface TranslationJobSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

/** Job payload: translate one saved English transcript's segments into `language`. */
export interface TranslationJob {
  filename: string;
  transcriptId: string;
  segments: TranslationJobSegment[];
}

export const TRANSLATION_LANGUAGES = [
  { queue: "german-transcript", language: "German", langCode: "de" },
  { queue: "hindi-transcript", language: "Hindi", langCode: "hi" },
  { queue: "french-transcript", language: "French", langCode: "fr" },
  { queue: "spanish-transcript", language: "Spanish", langCode: "es" },
] as const;

const globalForTranslationQueues = globalThis as unknown as {
  __translationQueues?: Map<string, Queue<TranslationJob>>;
};

const translationQueues =
  globalForTranslationQueues.__translationQueues ??
  new Map(
    TRANSLATION_LANGUAGES.map(({ queue }) => [
      queue,
      new Queue<TranslationJob>(queue, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      }),
    ])
  );

if (process.env.NODE_ENV !== "production") {
  globalForTranslationQueues.__translationQueues = translationQueues;
}

/**
 * Fan out one job to each of the 4 language queues (german/hindi/french/spanish
 * -transcript) so their dedicated workers can translate the saved English
 * transcript via Qwen and save each result to MinIO. Best-effort: throws are
 * left to the caller to catch so a queue outage never blocks transcription.
 */
export async function enqueueTranslations(
  filename: string,
  segments: TranslationJobSegment[],
  transcriptId: string
) {
  return Promise.all(
    TRANSLATION_LANGUAGES.map(({ queue, langCode }) => {
      const q = translationQueues.get(queue)!;
      return q.add(
        "translate",
        { filename, segments, transcriptId },
        { jobId: `translate-${langCode}-${filename}` }
      );
    })
  );
}
