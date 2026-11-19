/**
 * Screen 11/12 final-export pipeline: burns subtitles for a chosen language
 * onto the Gemini highlight reel, cropped/scaled to portrait or landscape.
 *
 * A highlight reel is *not* a straight trim of the master audio's timeline —
 * it's a concatenation of a handful of non-contiguous moments Gemini picked
 * (see lib/highlight-reel.ts). Burning the transcript's original timestamps
 * onto it directly would show the wrong line over the wrong cut. The reel's
 * sidecar JSON (`<reel>.json` in the transcripts bucket) records exactly which
 * [start, end) of the source timeline each concatenated clip came from, which
 * is enough to re-time the transcript's cues onto the reel's own timeline —
 * see `remapCuesToReel`. Translated exports instead transcribe the actual
 * edit locally and synthesize the snapshotted voice into its speech windows.
 */
import { createHash } from "node:crypto";
import { createReelDub } from "./reel-dub";
import { translateSegmentTexts } from "./qwen";
import { CHATTERBOX_REVISION, CHATTERBOX_CHECKPOINT, voiceProfile, isVoiceId, type VoiceId } from "./voice-profiles";
import { EXPORT_AUDIO_LABELS, type ExportAudioLanguage } from "./export-settings";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  TTS_AUDIO_BUCKET,
  TRANSCRIPTS_BUCKET,
  VIDEO_BUCKET,
  downloadObjectToFile,
  getObjectBuffer,
  uploadObject,
} from "@/lib/minio";
import { composeFinalExport, probeDurationSeconds } from "@/lib/ffmpeg";
import { renderSubtitlePng } from "@/lib/subtitle-image";
import { getTranscriptForLanguage } from "@/lib/transcript-language";
import { findBackground } from "@/lib/green-screen";
import { backgroundImagePath } from "@/lib/green-screen-paths";

/** Sentinel meaning "no background swap" — see VideoJob.backgroundId in schema.prisma. */
export const NO_BACKGROUND = "none";

/**
 * Bounds the final ffmpeg composite pass so a hung/runaway export can't sit
 * on the worker's single concurrency slot indefinitely — a live incident saw
 * one stuck for 30+ minutes at near-zero CPU while newer requests queued up
 * behind it. On timeout the ffmpeg child is killed and the run rejects like
 * any other ffmpeg failure, so BullMQ's existing attempts/backoff (see
 * lib/queue.ts) retries it exactly like any other failure. Follows the same
 * env-var-override convention as BG_QUEUE_CONCURRENCY (lib/queue.ts).
 */
export const FFMPEG_EXPORT_TIMEOUT_MS = parseInt(
  process.env.FFMPEG_EXPORT_TIMEOUT_MS || String(10 * 60 * 1000),
  10
);

export type ExportAspect = "portrait" | "landscape";

const DIMENSIONS: Record<ExportAspect, { width: number; height: number; crop: boolean }> = {
  portrait: { width: 1080, height: 1920, crop: true },
  landscape: { width: 1920, height: 1080, crop: false },
};

/** Band the subtitle text is centered in, near the bottom of the frame. */
const SUBTITLE_BAND_HEIGHT: Record<ExportAspect, number> = {
  portrait: 260,
  landscape: 180,
};
const SUBTITLE_FONT_SIZE: Record<ExportAspect, number> = {
  portrait: 46,
  landscape: 40,
};

export interface TimedCue {
  start: number;
  end: number;
  text: string;
}

interface ReelSidecarSegment {
  camera: number;
  start: number;
  end: number;
  reason: string;
}

interface ReelSidecar {
  title: string;
  sources: string[];
  segments: ReelSidecarSegment[];
}

/** Fetches the sidecar the highlight-reel worker wrote alongside the reel itself. */
export async function getHighlightReelSidecar(reelFilename: string): Promise<ReelSidecar> {
  const key = `${reelFilename}.json`;
  const buf = await getObjectBuffer(TRANSCRIPTS_BUCKET, key);
  return JSON.parse(buf.toString("utf-8"));
}

/**
 * Re-times cues from the source (master-audio) timeline onto the reel's own
 * timeline. `reelSegments` must be in the same order the reel concatenated
 * them in (the sidecar's `segments` already are — see lib/highlight-analysis.ts).
 * A cue spanning a cut boundary is split into the piece(s) that survived it.
 */
export function remapCuesToReel(
  cues: TimedCue[],
  reelSegments: { start: number; end: number }[]
): TimedCue[] {
  const out: TimedCue[] = [];
  let reelOffset = 0;

  for (const seg of reelSegments) {
    for (const cue of cues) {
      const overlapStart = Math.max(cue.start, seg.start);
      const overlapEnd = Math.min(cue.end, seg.end);
      if (overlapEnd > overlapStart) {
        out.push({
          start: reelOffset + (overlapStart - seg.start),
          end: reelOffset + (overlapEnd - seg.start),
          text: cue.text,
        });
      }
    }
    reelOffset += seg.end - seg.start;
  }

  return out;
}

const LANGUAGE_CODES: Record<string, string> = {
  English: "en",
  German: "de",
  Hindi: "hi",
  French: "fr",
  Spanish: "es",
};

export interface ComposeExportResult {
  filename: string;
  url: string;
  size: number;
  dubAudioKey: string | null;
  dubManifestKey: string | null;
}

/**
 * Fetches the reel's sidecar + that language's transcript and re-times the
 * cues onto the reel's own timeline. Shared by `composeExportVideo` (which
 * burns these in with ffmpeg) and the /api/subtitle-cues route (which hands
 * them to Screen 08 for a live CSS-overlay preview before anyone renders
 * anything) — same cues, same correctness, two different renderers.
 */
export async function getRemappedCuesForReel(params: {
  reelFilename: string;
  sourceAudio: string;
  language: string;
}): Promise<TimedCue[]> {
  const { reelFilename, sourceAudio, language } = params;
  const langCode = LANGUAGE_CODES[language] || "en";

  const sidecar = await getHighlightReelSidecar(reelFilename);

  const languageResult = await getTranscriptForLanguage(
    sourceAudio,
    language === "English" ? null : { language, langCode }
  );
  if (!languageResult.exists || !languageResult.transcript) {
    throw new Error(`No transcript found for source audio "${sourceAudio}"`);
  }

  const cues: TimedCue[] = languageResult.transcript.segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  return remapCuesToReel(cues, sidecar.segments).filter((c) => c.text.trim());
}

/**
 * Full pipeline for one (reel, source audio, language, aspect) combination.
 * `sourceAudio` is the master-audio recording whose transcript supplies the
 * subtitle text — same URL shape Screens 04/05/08 already use, picked
 * explicitly by the director rather than guessed, since a wrong guess would
 * silently caption the reel with someone else's session.
 */
export async function composeExportVideo(params: {
  reelFilename: string;
  exportKey: string;
  audioLanguage: ExportAudioLanguage;
  voiceId: VoiceId | "original";
  sourceAudio: string;
  language: string;
  aspect: ExportAspect;
  /** One of lib/green-screen.ts's GREEN_SCREEN_BACKGROUNDS ids, or NO_BACKGROUND. */
  backgroundId?: string;
  /** Fired every ~30s with the ffmpeg child's pid — see lib/generation-heartbeat.ts. */
  onHeartbeat?: (pid: number) => void;
}): Promise<ComposeExportResult> {
  const { reelFilename, sourceAudio, language, aspect, backgroundId = NO_BACKGROUND, onHeartbeat } = params;
  const langCode = LANGUAGE_CODES[language] || "en";
  const dims = DIMENSIONS[aspect];
  const background = backgroundId === NO_BACKGROUND ? undefined : findBackground(backgroundId);

  const workDir = await mkdtemp(join(tmpdir(), "video-export-"));

  try {
    const reelPath = join(workDir, "reel.mp4");
    await downloadObjectToFile(VIDEO_BUCKET, reelFilename, reelPath);

    const duration = await probeDurationSeconds(reelPath);
    const { audioLanguage, voiceId, exportKey } = params;
    if ((audioLanguage === "en") !== (voiceId === "original")) throw new Error("Invalid export audio selection");
    const dub = audioLanguage !== "en" && isVoiceId(voiceId)
      ? await createReelDub({ reelPath, workDir, duration, audioLanguage, voiceId, onHeartbeat }) : null;
    let remapped: TimedCue[];
    if (dub) {
      if (language === EXPORT_AUDIO_LABELS[audioLanguage]) remapped = dub.cues;
      else if (language === "English") remapped = dub.sourceCues;
      else {
        const subtitles = await translateSegmentTexts(dub.sourceCues.map(c => c.text), language);
        remapped = dub.sourceCues.map((cue, i) => ({ ...cue, text: subtitles[i] }));
      }
    } else remapped = await getRemappedCuesForReel({ reelFilename, sourceAudio, language });

    const bandHeight = SUBTITLE_BAND_HEIGHT[aspect];
    const subtitles = await Promise.all(
      remapped.map(async (cue, i) => {
        const pngPath = `sub-${String(i).padStart(3, "0")}.png`;
        const png = await renderSubtitlePng(cue.text, {
          width: dims.width,
          height: bandHeight,
          fontSize: SUBTITLE_FONT_SIZE[aspect],
        });
        await writeFile(join(workDir, pngPath), png);
        return { pngPath, start: cue.start, end: cue.end };
      })
    );

    const outFilename = `${aspect}-${langCode}-audio-${audioLanguage}-${voiceId}-${exportKey.slice(0, 24)}.mp4`;
    const outPath = join(workDir, "export.mp4");

    await composeFinalExport({
      input: reelPath,
      replacementAudio: dub?.audioPath,
      duration,
      audioLanguage: ({ en: "eng", hi: "hin", de: "deu", fr: "fra", es: "spa" })[audioLanguage],
      voiceLabel: voiceId === "original" ? "Original recording" : `${voiceProfile(voiceId).label} (${voiceId})`,
      output: outPath,
      width: dims.width,
      height: dims.height,
      crop: dims.crop,
      subtitles,
      backgroundImage: background ? backgroundImagePath(background.id) : undefined,
      cwd: workDir,
      timeoutMs: FFMPEG_EXPORT_TIMEOUT_MS,
      onHeartbeat,
    });

    let dubAudioKey: string | null = null;
    let dubManifestKey: string | null = null;
    if (dub) {
      const audioBytes = await readFile(dub.audioPath);
      dubAudioKey = "export-dubs/" + exportKey + ".wav";
      dubManifestKey = outFilename + ".audio.json";
      await uploadObject(TTS_AUDIO_BUCKET, dubAudioKey, audioBytes, "audio/wav");
      await uploadObject(VIDEO_BUCKET, dubManifestKey, Buffer.from(JSON.stringify({
        exportKey, audioLanguage, voiceId, modelRevision: CHATTERBOX_REVISION, checkpoint: CHATTERBOX_CHECKPOINT,
        duration, cues: dub.cues, sourceCues: dub.sourceCues, timing: dub.timing,
        wavSha256: createHash("sha256").update(audioBytes).digest("hex"),
      }, null, 2)), "application/json");
    }
    const bytes = await readFile(outPath);
    await uploadObject(VIDEO_BUCKET, outFilename, bytes, "video/mp4");
    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(outFilename)}`;

    return { filename: outFilename, url, size: bytes.length, dubAudioKey, dubManifestKey };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
