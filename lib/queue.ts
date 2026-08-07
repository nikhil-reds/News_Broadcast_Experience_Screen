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

/** Job payload: the three camera takes (in the MinIO `videos` bucket) to cut. */
export interface HighlightReelJob {
  cam1Filename: string;
  cam2Filename: string;
  cam3Filename: string;
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
 * take, so whichever upload lands last can enqueue without racing the others
 * into a duplicate job.
 */
export async function enqueueHighlightReel(
  cam1Filename: string,
  cam2Filename: string,
  cam3Filename: string
) {
  const jobId = `highlight-${cam1Filename}`;
  const existing = await highlightQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  return highlightQueue.add(
    "build-reel",
    { cam1Filename, cam2Filename, cam3Filename },
    { jobId }
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
    TRANSLATION_LANGUAGES.map(async ({ queue, langCode }) => {
      const q = translationQueues.get(queue)!;
      const jobId = `translate-${langCode}-${filename}`;
      const existing = await q.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "completed" || state === "failed") {
          await existing.remove().catch(() => {});
        }
      }
      return q.add(
        "translate",
        { filename, segments, transcriptId },
        { jobId }
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
  const jobId = `audio-${langCode}-${filename}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  return q.add(
    "synthesize",
    { translationId, filename, langCode, text },
    { jobId }
  );
}

// ---------------------------------------------------------------------------
// Green-screen queue: Screen 07's live background swap. One job per
// background id — the ffmpeg chromakey composite is cached on disk, so this
// only ever fires once per background (see lib/green-screen.ts).
// ---------------------------------------------------------------------------

export const GREEN_SCREEN_QUEUE = "green-screen-compose";

/** Job payload: which background image to composite the studio take onto. */
export interface GreenScreenJob {
  backgroundId: string;
}

const globalForGreenScreenQueue = globalThis as unknown as {
  __greenScreenQueue?: Queue<GreenScreenJob>;
};

export const greenScreenQueue =
  globalForGreenScreenQueue.__greenScreenQueue ??
  new Queue<GreenScreenJob>(GREEN_SCREEN_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForGreenScreenQueue.__greenScreenQueue = greenScreenQueue;
}

/**
 * Enqueue (or reuse) the compose job for one background. The jobId is the
 * background id itself, so clicking the same swatch twice while it's still
 * rendering re-attaches to the same job instead of starting a second ffmpeg
 * pass.
 *
 * A jobId is a *permanent* dedup key in BullMQ, though — not just a
 * while-it-runs one. Once a job with this id lands in the completed (or
 * failed) set, `add()` silently hands back that finished record and never runs
 * anything, and `removeOnComplete: 50` keeps it around for a long time. The
 * file it produced lives in gitignored `public/generated/` and can vanish
 * independently of Redis, so that stale record used to make a missing
 * composite permanently unrenderable: the poll route reported "completed",
 * Screen 07 marked the swatch ready, the <video> 404'd to black, and its
 * error-retry re-enqueued straight back into the same no-op.
 *
 * So: drop any *finished* record for this id before adding. Jobs still
 * waiting/active are deliberately left alone — that's the dedup we do want.
 */
export async function enqueueGreenScreenCompose(backgroundId: string) {
  const jobId = `greenscreen-${backgroundId}`;

  const existing = await greenScreenQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      // Can still lose a race with another request doing the same thing; the
      // loser's remove() throwing is harmless, `add()` below dedups anyway.
      await existing.remove().catch(() => {});
    }
  }

  return greenScreenQueue.add("compose", { backgroundId }, { jobId });
}
