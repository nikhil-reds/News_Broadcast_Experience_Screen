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
 * see `remapCuesToReel`. The reel's audio (camera 1, English) is kept as-is;
 * only the subtitle text changes with language, same as a subtitled (not
 * dubbed) foreign broadcast.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  TRANSCRIPTS_BUCKET,
  VIDEO_BUCKET,
  downloadObjectToFile,
  getObjectBuffer,
  uploadObject,
} from "@/lib/minio";
import { composeFinalExport } from "@/lib/ffmpeg";
import { renderSubtitlePng } from "@/lib/subtitle-image";
import { getTranscriptForLanguage } from "@/lib/transcript-language";
import { HIGHLIGHT_FILENAME_PREFIX } from "@/lib/camera-recordings";
import { findBackground } from "@/lib/green-screen";
import { backgroundImagePath } from "@/lib/green-screen-paths";

/** Sentinel meaning "no background swap" — see VideoJob.backgroundId in schema.prisma. */
export const NO_BACKGROUND = "none";

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

function exportFilename(
  reelFilename: string,
  aspect: ExportAspect,
  langCode: string,
  backgroundId: string
): string {
  const stamp = reelFilename.replace(HIGHLIGHT_FILENAME_PREFIX, "").replace(/\.[^.]+$/, "");
  const bgSuffix = backgroundId === NO_BACKGROUND ? "" : `-${backgroundId}`;
  return `${aspect}-${langCode}${bgSuffix}-${stamp}.mp4`;
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
  sourceAudio: string;
  language: string;
  aspect: ExportAspect;
  /** One of lib/green-screen.ts's GREEN_SCREEN_BACKGROUNDS ids, or NO_BACKGROUND. */
  backgroundId?: string;
}): Promise<ComposeExportResult> {
  const { reelFilename, sourceAudio, language, aspect, backgroundId = NO_BACKGROUND } = params;
  const langCode = LANGUAGE_CODES[language] || "en";
  const dims = DIMENSIONS[aspect];
  const background = backgroundId === NO_BACKGROUND ? undefined : findBackground(backgroundId);

  const workDir = await mkdtemp(join(tmpdir(), "video-export-"));

  try {
    const reelPath = join(workDir, "reel.mp4");
    await downloadObjectToFile(VIDEO_BUCKET, reelFilename, reelPath);

    const remapped = await getRemappedCuesForReel({ reelFilename, sourceAudio, language });

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

    const outFilename = exportFilename(reelFilename, aspect, langCode, backgroundId);
    const outPath = join(workDir, "export.mp4");

    await composeFinalExport({
      input: reelPath,
      output: outPath,
      width: dims.width,
      height: dims.height,
      crop: dims.crop,
      subtitles,
      backgroundImage: background ? backgroundImagePath(background.id) : undefined,
      cwd: workDir,
    });

    const bytes = await readFile(outPath);
    await uploadObject(VIDEO_BUCKET, outFilename, bytes, "video/mp4");
    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(outFilename)}`;

    return { filename: outFilename, url, size: bytes.length };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
