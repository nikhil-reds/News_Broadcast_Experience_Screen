import { prisma } from "@/lib/prisma";
import { enqueueHighlightReel } from "@/lib/queue";
import {
  CAMERA_FILENAME_PREFIX,
  cameraIdFromFilename,
  highlightFilenameFor,
  otherCameraId,
  parseRecordingTimestamp,
} from "@/lib/camera-recordings";

/**
 * How far apart the two takes of one session may be stamped. Both cameras are
 * stopped by the same Nexmosphere press and named from the same clock, so they
 * land within seconds; two minutes is slack, not a real window.
 */
const PAIR_WINDOW_MS = 120_000;

/** How many recent takes of the other camera to consider when pairing. */
const PAIR_LOOKBACK = 20;

export interface PairResult {
  queued: boolean;
  pairedWith?: string;
  reason?: string;
}

/**
 * Called after a camera take is stored. The reel needs both angles, so the
 * first upload of a session finds nothing and the second one enqueues the job.
 */
export async function enqueueHighlightIfPairComplete(filename: string): Promise<PairResult> {
  const cameraId = cameraIdFromFilename(filename);
  if (!cameraId) return { queued: false, reason: "not a camera take" };

  const stampedAt = parseRecordingTimestamp(filename);
  if (stampedAt === null) return { queued: false, reason: "no timestamp in filename" };

  // For a 3-camera system, the others are:
  const otherIds = ([1, 2, 3] as const).filter((id) => id !== cameraId);
  const matchedFilenames: Record<number, string> = { [cameraId]: filename };

  for (const otherId of otherIds) {
    const candidates = await prisma.videoRecording.findMany({
      where: { filename: { startsWith: CAMERA_FILENAME_PREFIX[otherId] } },
      orderBy: { createdAt: "desc" },
      take: PAIR_LOOKBACK,
    });

    let bestMatch: string | null = null;
    let bestDelta = PAIR_WINDOW_MS;
    for (const row of candidates) {
      const otherStamp = parseRecordingTimestamp(row.filename);
      if (otherStamp === null) continue;
      const delta = Math.abs(otherStamp - stampedAt);
      if (delta <= bestDelta) {
        bestDelta = delta;
        bestMatch = row.filename;
      }
    }

    if (!bestMatch) {
      return {
        queued: false,
        reason: `missing camera ${otherId} take within 2 minutes`,
      };
    }
    matchedFilenames[otherId] = bestMatch;
  }

  const cam1Filename = matchedFilenames[1];
  const cam2Filename = matchedFilenames[2];
  const cam3Filename = matchedFilenames[3];

  // The reel name is derived from the camera-1 take, so an existing row means
  // this session has already been cut.
  const existing = await prisma.videoRecording.findUnique({
    where: { filename: highlightFilenameFor(cam1Filename) },
    select: { filename: true },
  });
  if (existing) {
    return { queued: false, reason: "reel already built" };
  }

  await enqueueHighlightReel(cam1Filename, cam2Filename, cam3Filename);
  return { queued: true };
}
