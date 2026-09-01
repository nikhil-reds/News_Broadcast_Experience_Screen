/**
 * Highlight-reel pipeline, stage 2 of 2: ffmpeg render.
 *
 * Takes the segments Gemini already picked (lib/highlight-analysis.ts, stage
 * 1) and cuts/concats them -> the reel goes back into the MinIO `videos`
 * bucket under a `highlight-` prefix, which is what Screen 06 loops.
 *
 * Deliberately does not call Gemini itself — that's stage 1's job, run as its
 * own BullMQ job/queue (app/worker/highlight-analysis.ts) so an ffmpeg
 * failure here is retried without re-spending a Gemini call, and a Gemini
 * failure there is retried without ever reaching ffmpeg.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, TRANSCRIPTS_BUCKET, VIDEO_BUCKET, downloadObjectToFile, uploadObject } from "@/lib/minio";
import { GEMINI_MODEL } from "@/lib/gemini";
import {
  concatClips,
  extractNormalizedClip,
  extractSyncedHighlightClip,
  probeStreamDurations,
} from "@/lib/ffmpeg";
import { highlightFilenameFor, type CameraId } from "@/lib/camera-recordings";
import type { HighlightAnalysisResult, HighlightSegment } from "@/lib/highlight-analysis";

export type { HighlightSegment };

/**
 * Bounds this stage's ffmpeg calls (one extractNormalizedClip per segment,
 * plus one concatClips) so a hung ffmpeg process can't sit on this worker's
 * single concurrency slot forever — same rationale as FFMPEG_EXPORT_TIMEOUT_MS
 * (lib/video-export.ts). Sized above a single ffmpeg pass since a reel's
 * render can spend several extractNormalizedClip calls plus one concatClips
 * inside the same job. On timeout the ffmpeg child is killed and the run
 * rejects like any other ffmpeg failure, so BullMQ's existing attempts/backoff
 * (lib/queue.ts) retries it exactly like any other failure. Follows the same
 * env-var-override convention as BG_QUEUE_CONCURRENCY (lib/queue.ts).
 */
export const FFMPEG_HIGHLIGHT_TIMEOUT_MS = parseInt(
  process.env.FFMPEG_HIGHLIGHT_TIMEOUT_MS || String(8 * 60 * 1000),
  10
);

export interface HighlightReelResult {
  filename: string;
  url: string;
  size: number;
  durationSeconds: number;
  segments: HighlightSegment[];
  title: string;
  model: string;
}

const SYNC_TOLERANCE_SECONDS = 0.15;

async function findMasterAudio(generationId?: string | null) {
  if (!generationId) return null;
  return prisma.audioFile.findFirst({
    where: {
      sessionId: generationId,
      filename: { not: "master-audio-16k.wav" },
    },
    orderBy: { createdAt: "desc" },
  });
}

function assertSyncedDurations(
  label: string,
  durations: { video: number | null; audio: number | null }
) {
  if (durations.video == null) {
    throw new Error(`${label} has no video duration`);
  }
  if (durations.audio == null) {
    throw new Error(`${label} has no audio duration`);
  }

  const difference = Math.abs(durations.video - durations.audio);
  if (difference > SYNC_TOLERANCE_SECONDS) {
    throw new Error(
      `${label} audio/video duration mismatch: video=${durations.video.toFixed(3)}s ` +
        `audio=${durations.audio.toFixed(3)}s diff=${difference.toFixed(3)}s`
    );
  }
}

/**
 * Cuts and joins the segments stage 1 already decided on. Re-downloads the
 * three takes rather than sharing stage 1's temp dir — the two stages are
 * separate BullMQ jobs (possibly on separate worker processes/machines), so
 * there's no directory to share across that boundary.
 */
export async function renderHighlightReel(
  cam1Filename: string,
  cam2Filename: string,
  cam3Filename: string,
  analysis: HighlightAnalysisResult,
  generationId?: string | null,
  opts?: {
    /** Bound each ffmpeg pass and kill+reject it if it runs longer than this. */
    timeoutMs?: number;
    onHeartbeat?: (pid: number) => void;
  }
): Promise<HighlightReelResult> {
  const { title, segments, audio } = analysis;
  const { timeoutMs, onHeartbeat } = opts || {};
  const workDir = await mkdtemp(join(tmpdir(), "highlight-render-"));

  try {
    const masterAudio = await findMasterAudio(generationId);
    const masterAudioPath = masterAudio
      ? join(workDir, `master-${masterAudio.objectKey || masterAudio.filename}`)
      : null;
    const sources: Record<CameraId, string> = {
      1: join(workDir, `cam1-${cam1Filename}`),
      2: join(workDir, `cam2-${cam2Filename}`),
      3: join(workDir, `cam3-${cam3Filename}`),
    };
    await Promise.all([
      downloadObjectToFile(VIDEO_BUCKET, cam1Filename, sources[1]),
      downloadObjectToFile(VIDEO_BUCKET, cam2Filename, sources[2]),
      downloadObjectToFile(VIDEO_BUCKET, cam3Filename, sources[3]),
      ...(masterAudio && masterAudioPath
        ? [downloadObjectToFile(AUDIO_BUCKET, masterAudio.objectKey || masterAudio.filename, masterAudioPath)]
        : []),
    ]);

    if (!masterAudioPath) {
      console.warn(
        `[highlight-reel] No master audio found for generation ${generationId || "(none)"}; ` +
          "falling back to camera audio/silence."
      );
    }

    const clips: string[] = [];
    for (const [index, segment] of segments.entries()) {
      const clip = `clip-${String(index).padStart(3, "0")}.mp4`;
      const expectedDuration = segment.end - segment.start;

      console.log({
        segmentNumber: index + 1,
        camera: segment.camera,
        sessionStart: segment.start,
        sessionEnd: segment.end,
        cameraOffset: 0,
        videoStart: segment.start,
        videoEnd: segment.end,
        audioOffset: 0,
        audioStart: segment.start,
        audioEnd: segment.end,
        expectedDuration,
      });

      if (masterAudioPath) {
        await extractSyncedHighlightClip({
          videoInput: sources[segment.camera],
          audioInput: masterAudioPath,
          start: segment.start,
          end: segment.end,
          output: clip,
          cwd: workDir,
          timeoutMs,
          onHeartbeat,
        });
      } else {
        await extractNormalizedClip({
          input: sources[segment.camera],
          start: segment.start,
          end: segment.end,
          output: clip,
          withSilentAudio: !audio[segment.camera],
          cwd: workDir,
          timeoutMs,
          onHeartbeat,
        });
      }

      const clipDurations = await probeStreamDurations(join(workDir, clip));
      console.log({
        segmentNumber: index + 1,
        videoDuration: clipDurations.video,
        audioDuration: clipDurations.audio,
        difference:
          clipDurations.video != null && clipDurations.audio != null
            ? Math.abs(clipDurations.video - clipDurations.audio)
            : null,
      });
      assertSyncedDurations(`highlight segment ${index + 1}`, clipDurations);
      clips.push(clip);
    }

    const reelFilename = highlightFilenameFor(cam1Filename);
    const reelPath = join(workDir, "highlight.mp4");
    await concatClips(clips, "highlight.mp4", workDir, undefined, timeoutMs, onHeartbeat);
    const finalDurations = await probeStreamDurations(reelPath);
    assertSyncedDurations("final highlight reel", finalDurations);

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
        sessionId: generationId,
      },
      update: { url, size: reelBytes.length, contentType: "video/mp4", sessionId: generationId },
    });

    // Sidecar keyed off the REEL's filename (not the analysis stage's, which
    // is keyed off cam1Filename) — lib/video-export.ts's
    // getHighlightReelSidecar() reads this exact key to re-time Screen 8's
    // subtitle cues onto the reel's own cut timeline. This must stay in sync
    // with that reader: same key format, same {title, sources, segments} shape.
    const sidecarKey = `${reelFilename}.json`;
    await uploadObject(
      TRANSCRIPTS_BUCKET,
      sidecarKey,
      Buffer.from(
        JSON.stringify(
          {
            title,
            model: GEMINI_MODEL,
            sessionId: generationId ?? null,
            masterAudio: masterAudio
              ? {
                  filename: masterAudio.filename,
                  objectKey: masterAudio.objectKey || masterAudio.filename,
                  url: masterAudio.url,
                }
              : null,
            sync: {
              camera1Offset: 0,
              camera2Offset: 0,
              camera3Offset: 0,
              audioOffset: 0,
            },
            sources: [cam1Filename, cam2Filename, cam3Filename],
            segments,
            validation: {
              videoDuration: finalDurations.video,
              audioDuration: finalDurations.audio,
              difference:
                finalDurations.video != null && finalDurations.audio != null
                  ? Math.abs(finalDurations.video - finalDurations.audio)
                  : null,
            },
          },
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
