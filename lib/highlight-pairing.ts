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

  const counterpartId = otherCameraId(cameraId);
  const candidates = await prisma.videoRecording.findMany({
    where: { filename: { startsWith: CAMERA_FILENAME_PREFIX[counterpartId] } },
    orderBy: { createdAt: "desc" },
    take: PAIR_LOOKBACK,
  });

  let counterpart: string | null = null;
  let bestDelta = PAIR_WINDOW_MS;
  for (const row of candidates) {
    const otherStamp = parseRecordingTimestamp(row.filename);
    if (otherStamp === null) continue;
    const delta = Math.abs(otherStamp - stampedAt);
    if (delta <= bestDelta) {
      bestDelta = delta;
      counterpart = row.filename;
    }
  }

  if (!counterpart) {
    return { queued: false, reason: `no camera ${counterpartId} take within 2 minutes` };
  }

  const cam1Filename = cameraId === 1 ? filename : counterpart;
  const cam2Filename = cameraId === 2 ? filename : counterpart;

  // The reel name is derived from the camera-1 take, so an existing row means
  // this session has already been cut.
  const existing = await prisma.videoRecording.findUnique({
    where: { filename: highlightFilenameFor(cam1Filename) },
    select: { filename: true },
  });
  if (existing) {
    return { queued: false, pairedWith: counterpart, reason: "reel already built" };
  }

  await enqueueHighlightReel(cam1Filename, cam2Filename);
  return { queued: true, pairedWith: counterpart };
}
