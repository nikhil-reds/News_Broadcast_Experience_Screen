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
// Highlight-reel queue: one job per completed two-camera session.
// ---------------------------------------------------------------------------

export const HIGHLIGHT_QUEUE = "highlight-reel";

/** Job payload: the two camera takes (in the MinIO `videos` bucket) to cut. */
export interface HighlightReelJob {
  cam1Filename: string;
  cam2Filename: string;
}

const globalForHighlightQueue = globalThis as unknown as {
  __highlightQueue?: Queue<HighlightReelJob>;
};

export const highlightQueue =
  globalForHighlightQueue.__highlightQueue ??
  new Queue<HighlightReelJob>(HIGHLIGHT_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      // Gemini + ffmpeg is expensive; one retry rather than the usual three.
      attempts: 2,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForHighlightQueue.__highlightQueue = highlightQueue;
}

/**
 * Enqueue the reel for one session. The jobId is derived from the camera-1
 * take, so whichever upload lands second can enqueue without racing the other
 * into a duplicate job.
 */
export async function enqueueHighlightReel(cam1Filename: string, cam2Filename: string) {
  return highlightQueue.add(
    "build-reel",
    { cam1Filename, cam2Filename },
    { jobId: `highlight-${cam1Filename}` }
  );
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

// ---------------------------------------------------------------------------
// Audio-conversion queues: one per language, each with its own dedicated
// worker that turns a translated transcript into CosyVoice 2 speech.
// ---------------------------------------------------------------------------

/** Job payload: synthesize speech for one language's already-persisted translation. */
export interface AudioConversionJob {
  translationId: string;
  filename: string;
  langCode: string;
  text: string;
}

export const AUDIO_LANGUAGES = [
  { queue: "german-audio", language: "German", langCode: "de" },
  { queue: "hindi-audio", language: "Hindi", langCode: "hi" },
  { queue: "french-audio", language: "French", langCode: "fr" },
  { queue: "spanish-audio", language: "Spanish", langCode: "es" },
] as const;

const globalForAudioQueues = globalThis as unknown as {
  __audioConversionQueues?: Map<string, Queue<AudioConversionJob>>;
};

const audioConversionQueues =
  globalForAudioQueues.__audioConversionQueues ??
  new Map(
    AUDIO_LANGUAGES.map(({ queue }) => [
      queue,
      new Queue<AudioConversionJob>(queue, {
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
  globalForAudioQueues.__audioConversionQueues = audioConversionQueues;
}

/**
 * Enqueue one job on the matching `<langCode>-audio` queue so that language's
 * dedicated worker converts the just-persisted translation into speech via
 * CosyVoice 2. Best-effort: throws are left to the caller to catch so a queue
 * outage never blocks translation.
 */
export async function enqueueAudioConversion(
  langCode: string,
  translationId: string,
  filename: string,
  text: string
) {
  const entry = AUDIO_LANGUAGES.find((l) => l.langCode === langCode);
  if (!entry) throw new Error(`No audio-conversion queue for langCode "${langCode}"`);
  const q = audioConversionQueues.get(entry.queue)!;
  return q.add(
    "synthesize",
    { translationId, filename, langCode, text },
    { jobId: `audio-${langCode}-${filename}` }
  );
}
