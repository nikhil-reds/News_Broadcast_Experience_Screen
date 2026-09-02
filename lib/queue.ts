import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { upsertTaskPending } from "@/lib/generation";
import { GREEN_SCREEN_MATTING_VERSION } from "@/lib/green-screen";

/** Queue name shared by the producer (API) and the worker. */
export const TRANSCRIPTION_QUEUE = "audio-transcription";

/** Job payload: which audio object (in the MinIO `audio` bucket) to transcribe. */
export interface TranscriptionJob {
  filename: string;
  /** The recording cycle (BroadcastSession id) this audio belongs to, if any. */
  generationId?: string | null;
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
export async function enqueueTranscription(filename: string, generationId?: string | null) {
  const jobId = `transcribe-${filename}`;
  await upsertTaskPending(generationId, "transcription", jobId, { filename, generationId });
  return transcriptionQueue.add("transcribe", { filename, generationId }, { jobId });
}

// ---------------------------------------------------------------------------
// Highlight-reel pipeline: two chained queues, one per session.
//
// Stage 1 (highlight-analysis): Gemini picks the moments — lib/highlight-
// analysis.ts, app/worker/highlight-analysis.ts.
// Stage 2 (highlight-reel): ffmpeg cuts/concats those moments — lib/
// highlight-reel.ts, app/worker/highlight-reel.ts.
//
// These used to be one job that did both; split so a Gemini timeout and an
// ffmpeg failure are distinguishable/retryable independently instead of both
// just being "the highlight-reel job failed."
// ---------------------------------------------------------------------------

export const HIGHLIGHT_ANALYSIS_QUEUE = "highlight-analysis";

/** Job payload: the three camera takes (in the MinIO `videos` bucket) to analyze/cut. */
export interface HighlightPairJob {
  cam1Filename: string;
  cam2Filename: string;
  cam3Filename: string;
  generationId?: string | null;
}

const globalForHighlightAnalysisQueue = globalThis as unknown as {
  __highlightAnalysisQueue?: Queue<HighlightPairJob>;
};

export const highlightAnalysisQueue =
  globalForHighlightAnalysisQueue.__highlightAnalysisQueue ??
  new Queue<HighlightPairJob>(HIGHLIGHT_ANALYSIS_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      // Gemini calls are expensive but a failed job must never permanently
      // block a generation without at least the standard 3 attempts.
      attempts: 3,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForHighlightAnalysisQueue.__highlightAnalysisQueue = highlightAnalysisQueue;
}

/**
 * Enqueue stage 1 (Gemini analysis) for one session. The jobId is derived
 * from the camera-1 take, so whichever of the 3 camera uploads lands last
 * (see lib/highlight-pairing.ts) can enqueue without racing the others into a
 * duplicate job.
 */
export async function enqueueHighlightAnalysis(
  cam1Filename: string,
  cam2Filename: string,
  cam3Filename: string,
  generationId?: string | null
) {
  const jobId = `highlight-analysis-${cam1Filename}`;
  const existing = await highlightAnalysisQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  await upsertTaskPending(generationId, "highlight-analysis", jobId, {
    cam1Filename,
    cam2Filename,
    cam3Filename,
    generationId,
  });
  return highlightAnalysisQueue.add(
    "analyze",
    { cam1Filename, cam2Filename, cam3Filename, generationId },
    { jobId }
  );
}

export const HIGHLIGHT_QUEUE = "highlight-reel";

/** Job payload: stage 2 renders exactly the segments stage 1 already decided on. */
export interface HighlightRenderJob extends HighlightPairJob {
  title: string;
  segments: { camera: 1 | 2 | 3; start: number; end: number; reason: string }[];
  audio: Record<number, boolean>;
}

const globalForHighlightQueue = globalThis as unknown as {
  __highlightQueue?: Queue<HighlightRenderJob>;
};

export const highlightQueue =
  globalForHighlightQueue.__highlightQueue ??
  new Queue<HighlightRenderJob>(HIGHLIGHT_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      // Pure ffmpeg at this point (no Gemini call), so a couple retries are cheap.
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForHighlightQueue.__highlightQueue = highlightQueue;
}

/**
 * Enqueue stage 2 (ffmpeg render) once stage 1 has decided the segments.
 * Called by app/worker/highlight-analysis.ts on its own completion, not by
 * lib/highlight-pairing.ts directly — the render queue's payload requires
 * segments that don't exist until stage 1 has run.
 */
export async function enqueueHighlightReel(
  cam1Filename: string,
  cam2Filename: string,
  cam3Filename: string,
  analysis: { title: string; segments: HighlightRenderJob["segments"]; audio: Record<number, boolean> },
  generationId?: string | null
) {
  const jobId = `highlight-${cam1Filename}`;
  const existing = await highlightQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  await upsertTaskPending(generationId, "highlight-reel", jobId, {
    cam1Filename,
    cam2Filename,
    cam3Filename,
    ...analysis,
    generationId,
  });
  return highlightQueue.add(
    "build-reel",
    { cam1Filename, cam2Filename, cam3Filename, ...analysis, generationId },
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
  generationId?: string | null;
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
  transcriptId: string,
  generationId?: string | null
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
      await upsertTaskPending(generationId, `translation-${langCode}`, jobId, {
        filename,
        segments,
        transcriptId,
        generationId,
      });
      return q.add(
        "translate",
        { filename, segments, transcriptId, generationId },
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
  sourceAudioFilename?: string;
  speakerGender?: "male" | "female" | "unknown";
  referenceAudioBucket?: string;
  referenceAudioObjectKey?: string;
  generationId?: string | null;
}

export const AUDIO_LANGUAGES = [
  { queue: "german-audio", language: "German", langCode: "de" },
  { queue: "hindi-audio", language: "Hindi", langCode: "hi" },
  { queue: "french-audio", language: "French", langCode: "fr" },
  { queue: "spanish-audio", language: "Spanish", langCode: "es" },
] as const;

export const AUDIO_CONVERSION_JOB_VERSION = "voice-v2";

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
  text: string,
  generationId?: string | null,
  voice?: {
    sourceAudioFilename?: string;
    speakerGender?: "male" | "female" | "unknown";
    referenceAudioBucket?: string;
    referenceAudioObjectKey?: string;
  }
) {
  const entry = AUDIO_LANGUAGES.find((l) => l.langCode === langCode);
  if (!entry) throw new Error(`No audio-conversion queue for langCode "${langCode}"`);
  const q = audioConversionQueues.get(entry.queue)!;
  const jobId = `audio-${AUDIO_CONVERSION_JOB_VERSION}-${langCode}-${filename}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  await upsertTaskPending(generationId, `tts-${langCode}`, jobId, {
    langCode,
    translationId,
    filename,
    text,
    ...voice,
    generationId,
  });
  return q.add(
    "synthesize",
    { translationId, filename, langCode, text, generationId, ...voice },
    { jobId }
  );
}

// ---------------------------------------------------------------------------
// Green-screen queue: Screen 07's live background swap. One job per
// (background id, edited reel) pair. The expensive video-matting result is
// cached once per reel, and each final background MP4 is cached separately
// (see lib/green-screen.ts).
// ---------------------------------------------------------------------------

export const GREEN_SCREEN_QUEUE = "green-screen-compose";

/** Job payload: which background to composite the latest edited reel onto. */
export interface GreenScreenJob {
  backgroundId: string;
  /** Edited/highlight reel filename (MinIO `videos` bucket) to matte/composite. */
  sourceFilename: string;
  generationId?: string | null;
}

const globalForGreenScreenQueue = globalThis as unknown as {
  __greenScreenQueue?: Queue<GreenScreenJob>;
};

export const greenScreenQueue =
  globalForGreenScreenQueue.__greenScreenQueue ??
  new Queue<GreenScreenJob>(GREEN_SCREEN_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  });

// Allow up to 5 parallel background renders (one per background option).
// Increase if adding more background choices. This caps how many the WORKER
// runs concurrently across all its BullMQ groups; the worker itself is
// started with concurrency: 1 (see app/worker/green-screen-compose.ts) — bump
// that too if raising this.
const BG_QUEUE_CONCURRENCY = parseInt(process.env.BG_QUEUE_CONCURRENCY || "5", 10);
greenScreenQueue.setGlobalConcurrency(BG_QUEUE_CONCURRENCY).catch(() => {});

if (process.env.NODE_ENV !== "production") {
  globalForGreenScreenQueue.__greenScreenQueue = greenScreenQueue;
}

/**
 * Enqueue (or reuse) the compose job for one (background, edited reel) pair. The
 * jobId is derived from both, so clicking the same swatch twice against the
 * same edited reel re-attaches to the same job instead of starting a second
 * compose pass — and a *new* reel (different sourceFilename) naturally gets
 * its own jobId rather than colliding with the old one.
 *
 * A jobId is a *permanent* dedup key in BullMQ, though — not just a
 * while-it-runs one. Once a job with this id lands in the completed (or
 * failed) set, `add()` silently hands back that finished record and never runs
 * anything, and `removeOnComplete: 50` keeps it around for a long time. The
 * file it produced can still vanish from MinIO independently of Redis (bucket
 * cleared, object deleted), so that stale record used to make a missing
 * composite permanently unrenderable: the poll route reported "completed",
 * Screen 07 marked the swatch ready, the <video> 404'd to black, and its
 * error-retry re-enqueued straight back into the same no-op.
 *
 * So: drop any *finished* record for this id before adding. Jobs still
 * waiting/active are deliberately left alone — that's the dedup we do want.
 */
export async function enqueueGreenScreenCompose(
  backgroundId: string,
  sourceFilename: string,
  generationId?: string | null
) {
  const jobId = greenScreenJobId(backgroundId, sourceFilename);

  const existing = await greenScreenQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      // Can still lose a race with another request doing the same thing; the
      // loser's remove() throwing is harmless, `add()` below dedups anyway.
      await existing.remove().catch(() => {});
    }
  }

  await upsertTaskPending(generationId, `greenscreen-${backgroundId}`, jobId, {
    backgroundId,
    sourceFilename,
    generationId,
  });
  return greenScreenQueue.add("compose", { backgroundId, sourceFilename, generationId }, { jobId });
}

/**
 * Same derivation the poll route needs to reconstruct a jobId from its two
 * parts. Kept in lockstep with the RVM cache version so old chromakey jobs
 * cannot satisfy the edited-reel matting path.
 */
export function greenScreenJobId(backgroundId: string, sourceFilename: string): string {
  return `greenscreen-${GREEN_SCREEN_MATTING_VERSION}-${backgroundId}-${sourceFilename}`;
}

/**
 * Enqueue background composition jobs for all available backgrounds. With the
 * RVM path, the first job to run creates/reuses the reel matte and the rest
 * only perform cheaper FFmpeg composites.
 */
export async function enqueueAllBackgroundsForSource(sourceFilename: string, generationId?: string | null) {
  const { GREEN_SCREEN_BACKGROUNDS } = await import("@/lib/green-screen");

  const jobs = await Promise.all(
    GREEN_SCREEN_BACKGROUNDS.map((bg) =>
      enqueueGreenScreenCompose(bg.id, sourceFilename, generationId).catch((err) => {
        console.error(`[background-queue] Failed to enqueue ${bg.id}: ${err.message}`);
        return null;
      })
    )
  );

  const successful = jobs.filter((j) => j !== null);
  console.log(
    `[background-queue] Enqueued ${successful.length}/${GREEN_SCREEN_BACKGROUNDS.length} background composition jobs for "${sourceFilename}"`
  );

  return successful;
}

// ---------------------------------------------------------------------------
// Video-export queue: Screen 11/12's portrait/landscape final render. One
// worker handles both aspects — the composition logic only differs in target
// dimensions (lib/video-export.ts), so a second queue would just duplicate it.
// ---------------------------------------------------------------------------

export const VIDEO_EXPORT_QUEUE = "video-export";

export interface VideoExportJob {
  videoJobId: string;
  reelFilename: string;
  sourceAudio: string;
  language: string;
  aspect: "portrait" | "landscape";
  /** A lib/green-screen.ts background id, or "none" (see NO_BACKGROUND in lib/video-export.ts). */
  backgroundId: string;
  generationId?: string | null;
  /** Which screen (11 or 12) requested this export — used for the ScreenPublication variant publish. */
  screenId?: number;
}

const globalForVideoExportQueue = globalThis as unknown as {
  __videoExportQueue?: Queue<VideoExportJob>;
};

export const videoExportQueue =
  globalForVideoExportQueue.__videoExportQueue ??
  new Queue<VideoExportJob>(VIDEO_EXPORT_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForVideoExportQueue.__videoExportQueue = videoExportQueue;
}

export async function enqueueVideoExport(job: VideoExportJob) {
  // generationId baked in (not just reelFilename) so a superseded generation's
  // export job can never collide with/short-circuit a new generation's job id.
  const jobId = `export-${job.aspect}-${job.language}-${job.backgroundId}-${job.generationId ?? "legacy"}-${job.reelFilename}`;
  const existing = await videoExportQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {});
    }
  }
  if (job.generationId && job.screenId) {
    await upsertTaskPending(job.generationId, `video-export-${job.screenId}`, jobId, { ...job });
  }
  return videoExportQueue.add("compose", job, { jobId });
}

// ---------------------------------------------------------------------------
// Watchdog support (app/worker/watchdog.ts): given a GenerationTask.taskType,
// find the BullMQ queue it lives on so the watchdog can look its job up by
// GenerationTask.jobId and inspect job.getState().
// ---------------------------------------------------------------------------

export function getQueueForTaskType(
  taskType: string
):
  | Queue<TranscriptionJob>
  | Queue<HighlightPairJob>
  | Queue<HighlightRenderJob>
  | Queue<TranslationJob>
  | Queue<AudioConversionJob>
  | Queue<GreenScreenJob>
  | Queue<VideoExportJob>
  | undefined {
  if (taskType === "transcription") return transcriptionQueue;
  if (taskType === "highlight-analysis") return highlightAnalysisQueue;
  if (taskType === "highlight-reel") return highlightQueue;
  if (taskType.startsWith("greenscreen-")) return greenScreenQueue;
  if (taskType.startsWith("video-export-")) return videoExportQueue;

  if (taskType.startsWith("translation-")) {
    const langCode = taskType.slice("translation-".length);
    const entry = TRANSLATION_LANGUAGES.find((l) => l.langCode === langCode);
    return entry ? translationQueues.get(entry.queue) : undefined;
  }
  if (taskType.startsWith("tts-")) {
    const langCode = taskType.slice("tts-".length);
    const entry = AUDIO_LANGUAGES.find((l) => l.langCode === langCode);
    return entry ? audioConversionQueues.get(entry.queue) : undefined;
  }

  return undefined;
}
