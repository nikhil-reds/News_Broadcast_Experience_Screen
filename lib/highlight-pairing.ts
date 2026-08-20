import { prisma } from "@/lib/prisma";
import { enqueueHighlightAnalysis } from "@/lib/queue";
import { cameraIdFromFilename, highlightFilenameFor, type CameraId } from "@/lib/camera-recordings";

export interface PairResult {
  queued: boolean;
  reason?: string;
}

/**
 * Called after a camera take is stored. All 3 camera uploads for one take now
 * carry the same sessionId (set once when the operator presses "Start
 * Recording" — see app/(main)/camera/page.tsx), so completeness is a direct
 * count instead of the old approach of guessing which takes belong together
 * from filename timestamps within a 2-minute window. That heuristic could
 * silently miss the reel entirely if an upload lagged past the window; this
 * can't, since it's keyed by an explicit id shared at recording time.
 *
 * Recordings uploaded before this session concept existed (no sessionId) are
 * not paired here — nothing enqueues for them, same as if this function were
 * never called at all.
 */
export async function enqueueHighlightIfSessionComplete(sessionId: string | null): Promise<PairResult> {
  if (!sessionId) {
    return { queued: false, reason: "upload has no sessionId (pre-session recording)" };
  }

  const rows = await prisma.videoRecording.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  const byCamera: Partial<Record<CameraId, string>> = {};
  for (const row of rows) {
    const camId = cameraIdFromFilename(row.filename);
    if (camId) byCamera[camId] = row.filename;
  }

  const missing = ([1, 2, 3] as const).filter((id) => !byCamera[id]);
  if (missing.length > 0) {
    return { queued: false, reason: `waiting on camera ${missing.join(", ")} for session ${sessionId}` };
  }

  const cam1Filename = byCamera[1]!;
  const cam2Filename = byCamera[2]!;
  const cam3Filename = byCamera[3]!;

  const audio = await prisma.audioFile.findFirst({ where: { sessionId } });
  if (!audio) {
    return { queued: false, reason: `waiting on master audio for session ${sessionId}` };
  }

  // The reel name is derived from the camera-1 take, so an existing row means
  // this session has already been cut.
  const existing = await prisma.videoRecording.findUnique({
    where: { filename: highlightFilenameFor(cam1Filename) },
    select: { filename: true },
  });
  if (existing) {
    return { queued: false, reason: "reel already built" };
  }

  // Kicks off stage 1 (Gemini analysis) only — stage 2 (the ffmpeg render) is
  // chained from within app/worker/highlight-analysis.ts once Gemini's picks
  // are known, since its queue payload requires those segments. sessionId IS
  // the generationId (same value) — this take's BroadcastSession row.
  await enqueueHighlightAnalysis(cam1Filename, cam2Filename, cam3Filename, sessionId);
  return { queued: true };
}
