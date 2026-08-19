/**
 * Highlight-reel pipeline, stage 1 of 2: Gemini analysis.
 *
 * Both/all three camera takes of one session land in the MinIO `videos`
 * bucket -> Gemini 2.5 Pro watches them side by side and returns the
 * timestamps of the most engaging moments. This used to run in the same
 * BullMQ job as the ffmpeg cut/concat step (stage 2, lib/highlight-reel.ts) —
 * split out so the two are independently observable/retryable: a Gemini
 * timeout no longer needs to be told apart from an ffmpeg failure by reading
 * worker logs, and each stage gets its own queue, retry policy, and job
 * record. See app/worker/highlight-analysis.ts for the worker that calls this,
 * and app/worker/highlight-reel.ts for the render stage that follows it.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { hasAudioStream, probeDurationSeconds } from "@/lib/ffmpeg";
import type { CameraId } from "@/lib/camera-recordings";

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

/** What stage 1 hands to stage 2 (see enqueueHighlightReel in lib/queue.ts). */
export interface HighlightAnalysisResult {
  title: string;
  segments: HighlightSegment[];
  /** Whether each camera's take has its own audio stream (camera 1 usually does). */
  audio: Record<CameraId, boolean>;
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
          camera: { type: "INTEGER", description: "1 for CAMERA 01, 2 for CAMERA 02, 3 for CAMERA 03" },
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
    "You are given the SAME recording session from three angles, filmed simultaneously:",
    `- VIDEO A = CAMERA 01 (${durations[1].toFixed(1)}s, carries the studio audio)`,
    `- VIDEO B = CAMERA 02 (${durations[2].toFixed(1)}s, second angle, no audio)`,
    `- VIDEO C = CAMERA 03 (${durations[3].toFixed(1)}s, third angle, no audio)`,
    "",
    "Pick the most engaging seconds of the session: the strongest delivery, the",
    "clearest statements, visible reactions and gestures, and moments where the",
    "second or third angle is more interesting than the first. Skip dead air, fumbles,",
    "long pauses, and anything before the presenter settles.",
    "",
    "Rules:",
    `- Return between 3 and ${MAX_SEGMENTS} segments.`,
    `- Each segment must be between ${MIN_SEGMENT_SECONDS} and ${MAX_SEGMENT_SECONDS} seconds long.`,
    `- The segments must total no more than ${MAX_REEL_SECONDS} seconds.`,
    "- Order the segments chronologically and do not overlap them in time.",
    "- Cut between the three cameras where it makes the reel more watchable.",
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
    const camera: CameraId =
      segment.camera === 2 ? 2 : segment.camera === 3 ? 3 : 1;
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

/** Ask Gemini 2.5 Pro which seconds of the three takes are worth keeping. */
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
      let label = "VIDEO A — CAMERA 01:";
      if (cameraId === 2) label = "VIDEO B — CAMERA 02:";
      if (cameraId === 3) label = "VIDEO C — CAMERA 03:";
      parts.push({ text: label });
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
 * Stage 1: downloads all three takes, asks Gemini which moments to keep, and
 * persists the decision as a sidecar in MinIO immediately — so "what did
 * Gemini pick" is inspectable and durable even if stage 2 (the ffmpeg render)
 * later fails or is retried. Returns what stage 2 needs to actually cut the
 * reel; the caller (app/worker/highlight-analysis.ts) is what chains into it.
 */
export async function analyzeHighlightSegments(
  cam1Filename: string,
  cam2Filename: string,
  cam3Filename: string
): Promise<HighlightAnalysisResult> {
  const workDir = await mkdtemp(join(tmpdir(), "highlight-analysis-"));

  try {
    const sources: Record<CameraId, string> = {
      1: join(workDir, `cam1-${cam1Filename}`),
      2: join(workDir, `cam2-${cam2Filename}`),
      3: join(workDir, `cam3-${cam3Filename}`),
    };
    await Promise.all([
      downloadObjectToFile(VIDEO_BUCKET, cam1Filename, sources[1]),
      downloadObjectToFile(VIDEO_BUCKET, cam2Filename, sources[2]),
      downloadObjectToFile(VIDEO_BUCKET, cam3Filename, sources[3]),
    ]);

    const durations: Record<CameraId, number> = {
      1: await probeDurationSeconds(sources[1]),
      2: await probeDurationSeconds(sources[2]),
      3: await probeDurationSeconds(sources[3]),
    };
    const audio: Record<CameraId, boolean> = {
      1: await hasAudioStream(sources[1]),
      2: await hasAudioStream(sources[2]),
      3: await hasAudioStream(sources[3]),
    };

    const { title, segments: proposed } = await selectSegments(
      [
        { cameraId: 1, path: sources[1], filename: cam1Filename },
        { cameraId: 2, path: sources[2], filename: cam2Filename },
        { cameraId: 3, path: sources[3], filename: cam3Filename },
      ],
      durations
    );

    const segments = sanitizeSegments(proposed, durations);
    if (segments.length === 0) {
      throw new Error(
        `Gemini returned no usable segments for "${cam1Filename}" / "${cam2Filename}" / "${cam3Filename}" ` +
          `(${proposed.length} proposed, all outside the clip bounds or too short)`
      );
    }

    // Sidecar with the model's picks, written now (not after the render) so a
    // failed/retried render stage doesn't lose visibility into what Gemini
    // actually decided.
    const reelFilenameHint = `${cam1Filename}.analysis`;
    await uploadObject(
      TRANSCRIPTS_BUCKET,
      `${reelFilenameHint}.json`,
      Buffer.from(
        JSON.stringify(
          { title, model: GEMINI_MODEL, sources: [cam1Filename, cam2Filename, cam3Filename], segments, audio },
          null,
          2
        ),
        "utf-8"
      ),
      "application/json"
    );

    return { title, segments, audio };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
