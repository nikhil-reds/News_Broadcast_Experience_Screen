/**
 * Highlight-reel pipeline.
 *
 * Both camera takes of one session land in the MinIO `videos` bucket ->
 * Gemini 2.5 Pro watches them side by side and returns the timestamps of the
 * most engaging moments -> ffmpeg cuts those moments out, cutting between the
 * two angles -> the reel goes back into the `videos` bucket under a
 * `highlight-` prefix, which is what Screen 06 loops.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  TRANSCRIPTS_BUCKET,
  VIDEO_BUCKET,
  downloadObjectToFile,
  uploadObject,
} from "@/lib/minio";
import {
  GEMINI_MODEL,
  deleteFile,
  filePart,
  generateJson,
  uploadFile,
  waitUntilActive,
  type GeminiPart,
} from "@/lib/gemini";
import {
  concatClips,
  extractNormalizedClip,
  hasAudioStream,
  probeDurationSeconds,
} from "@/lib/ffmpeg";
import { highlightFilenameFor, type CameraId } from "@/lib/camera-recordings";

/** Guard rails applied to whatever Gemini hands back. */
const MIN_SEGMENT_SECONDS = 2;
const MAX_SEGMENT_SECONDS = 20;
const MAX_SEGMENTS = 8;
const MAX_REEL_SECONDS = 90;

export interface HighlightSegment {
  camera: CameraId;
  start: number;
  end: number;
  reason: string;
}

export interface HighlightReelResult {
  filename: string;
  url: string;
  size: number;
  durationSeconds: number;
  segments: HighlightSegment[];
  title: string;
  model: string;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Short headline for the reel" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          camera: { type: "INTEGER", description: "1 for CAMERA 01, 2 for CAMERA 02" },
          start: { type: "NUMBER", description: "Start time in seconds" },
          end: { type: "NUMBER", description: "End time in seconds" },
          reason: { type: "STRING", description: "Why this moment is engaging" },
        },
        required: ["camera", "start", "end", "reason"],
      },
    },
  },
  required: ["title", "segments"],
} as const;

function buildPrompt(durations: Record<CameraId, number>): string {
  return [
    "You are a broadcast editor cutting a highlight reel for a news studio.",
    "",
    "You are given the SAME recording session from two angles, filmed simultaneously:",
    `- VIDEO A = CAMERA 01 (${durations[1].toFixed(1)}s, carries the studio audio)`,
    `- VIDEO B = CAMERA 02 (${durations[2].toFixed(1)}s, second angle, no audio)`,
    "",
    "Pick the most engaging seconds of the session: the strongest delivery, the",
    "clearest statements, visible reactions and gestures, and moments where the",
    "second angle is more interesting than the first. Skip dead air, fumbles,",
    "long pauses, and anything before the presenter settles.",
    "",
    "Rules:",
    `- Return between 3 and ${MAX_SEGMENTS} segments.`,
    `- Each segment must be between ${MIN_SEGMENT_SECONDS} and ${MAX_SEGMENT_SECONDS} seconds long.`,
    `- The segments must total no more than ${MAX_REEL_SECONDS} seconds.`,
    "- Order the segments chronologically and do not overlap them in time.",
    "- Cut between the two cameras where it makes the reel more watchable.",
    '- "start" and "end" are seconds from the beginning of the file for the camera',
    "  named in that segment, as numbers (e.g. 12.5), never as MM:SS text.",
    "- Every timestamp must be inside that camera's duration listed above.",
  ].join("\n");
}

/**
 * Drop or repair whatever the model got wrong: out-of-range timestamps, clips
 * that are too short/long, overlaps, and runaway totals. A model that returns
 * one unusable range should cost us one clip, not the whole reel.
 */
export function sanitizeSegments(
  raw: HighlightSegment[],
  durations: Record<CameraId, number>
): HighlightSegment[] {
  const kept: HighlightSegment[] = [];
  let total = 0;

  const ordered = [...raw].sort((a, b) => a.start - b.start);

  for (const segment of ordered) {
    const camera: CameraId = segment.camera === 2 ? 2 : 1;
    const limit = durations[camera];

    const start = Math.max(0, Math.min(Number(segment.start), limit));
    let end = Math.max(0, Math.min(Number(segment.end), limit));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_SEGMENT_SECONDS) {
      continue;
    }
    if (end - start > MAX_SEGMENT_SECONDS) end = start + MAX_SEGMENT_SECONDS;

    // Overlap only matters within one camera; the two angles share a timeline.
    const previous = kept[kept.length - 1];
    if (previous && start < previous.end && camera === previous.camera) continue;

    const length = end - start;
    if (total + length > MAX_REEL_SECONDS) break;

    kept.push({ camera, start, end, reason: String(segment.reason || "").trim() });
    total += length;
    if (kept.length >= MAX_SEGMENTS) break;
  }

  return kept;
}

/** Ask Gemini 2.5 Pro which seconds of the two takes are worth keeping. */
async function selectSegments(
  files: { cameraId: CameraId; path: string; filename: string }[],
  durations: Record<CameraId, number>
): Promise<{ title: string; segments: HighlightSegment[] }> {
  const uploaded = [];

  try {
    for (const file of files) {
      const bytes = await readFile(file.path);
      const handle = await uploadFile(bytes, "video/mp4", file.filename);
      await waitUntilActive(handle);
      uploaded.push({ cameraId: file.cameraId, handle });
    }

    const parts: GeminiPart[] = [];
    for (const { cameraId, handle } of uploaded) {
      parts.push({ text: cameraId === 1 ? "VIDEO A — CAMERA 01:" : "VIDEO B — CAMERA 02:" });
      parts.push(filePart(handle));
    }
    parts.push({ text: buildPrompt(durations) });

    const result = await generateJson<{ title?: string; segments?: HighlightSegment[] }>(
      parts,
      RESPONSE_SCHEMA as unknown as Record<string, unknown>
    );

    return {
      title: String(result.title || "Studio highlights").trim(),
      segments: Array.isArray(result.segments) ? result.segments : [],
    };
  } finally {
    await Promise.all(uploaded.map(({ handle }) => deleteFile(handle)));
  }
}

/**
 * Full pipeline for one pair of camera takes already stored in the MinIO
 * `videos` bucket. Returns the reel that Screen 06 will pick up.
 */
export async function buildHighlightReel(
  cam1Filename: string,
  cam2Filename: string
): Promise<HighlightReelResult> {
  const workDir = await mkdtemp(join(tmpdir(), "highlight-reel-"));

  try {
    // 1. Pull both takes down next to each other.
    const sources: Record<CameraId, string> = {
      1: join(workDir, `cam1-${cam1Filename}`),
      2: join(workDir, `cam2-${cam2Filename}`),
    };
    await Promise.all([
      downloadObjectToFile(VIDEO_BUCKET, cam1Filename, sources[1]),
      downloadObjectToFile(VIDEO_BUCKET, cam2Filename, sources[2]),
    ]);

    const durations: Record<CameraId, number> = {
      1: await probeDurationSeconds(sources[1]),
      2: await probeDurationSeconds(sources[2]),
    };
    const audio: Record<CameraId, boolean> = {
      1: await hasAudioStream(sources[1]),
      2: await hasAudioStream(sources[2]),
    };

    // 2. Gemini picks the moments.
    const { title, segments: proposed } = await selectSegments(
      [
        { cameraId: 1, path: sources[1], filename: cam1Filename },
        { cameraId: 2, path: sources[2], filename: cam2Filename },
      ],
      durations
    );

    const segments = sanitizeSegments(proposed, durations);
    if (segments.length === 0) {
      throw new Error(
        `Gemini returned no usable segments for "${cam1Filename}" / "${cam2Filename}" ` +
          `(${proposed.length} proposed, all outside the clip bounds or too short)`
      );
    }

    // 3. Cut each moment, then join them.
    const clips: string[] = [];
    for (const [index, segment] of segments.entries()) {
      const clip = `clip-${String(index).padStart(3, "0")}.mp4`;
      await extractNormalizedClip({
        input: sources[segment.camera],
        start: segment.start,
        end: segment.end,
        output: clip,
        withSilentAudio: !audio[segment.camera],
        cwd: workDir,
      });
      clips.push(clip);
    }

    const reelFilename = highlightFilenameFor(cam1Filename);
    const reelPath = join(workDir, "highlight.mp4");
    await concatClips(clips, "highlight.mp4", workDir);

    // 4. Store the reel and register it so Screen 06 can find it.
    const reelBytes = await readFile(reelPath);
    await uploadObject(VIDEO_BUCKET, reelFilename, reelBytes, "video/mp4");
    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(reelFilename)}`;

    await prisma.videoRecording.upsert({
      where: { filename: reelFilename },
      create: {
        filename: reelFilename,
        url,
        bucket: VIDEO_BUCKET,
        objectKey: reelFilename,
        contentType: "video/mp4",
        size: reelBytes.length,
      },
      update: { url, size: reelBytes.length, contentType: "video/mp4" },
    });

    // Sidecar with the model's picks — the reel alone doesn't say why it cut
    // where it did, and that is the first question when one looks wrong.
    const sidecarKey = `${reelFilename}.json`;
    await uploadObject(
      TRANSCRIPTS_BUCKET,
      sidecarKey,
      Buffer.from(
        JSON.stringify(
          { title, model: GEMINI_MODEL, sources: [cam1Filename, cam2Filename], segments },
          null,
          2
        ),
        "utf-8"
      ),
      "application/json"
    );

    const durationSeconds = segments.reduce((sum, s) => sum + (s.end - s.start), 0);

    return {
      filename: reelFilename,
      url,
      size: reelBytes.length,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      segments,
      title,
      model: GEMINI_MODEL,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
