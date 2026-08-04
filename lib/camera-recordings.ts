/**
 * Both cameras write into the same `video_recordings` table, so the filename
 * prefix is what says which camera a take came from. Camera 1 keeps the
 * original `camera-recording-` prefix — clips recorded before camera 2 existed
 * still belong to it, and Screen 01 keeps looping them.
 */
export const CAMERA_IDS = [1, 2, 3] as const;

export type CameraId = (typeof CAMERA_IDS)[number];

export const CAMERA_FILENAME_PREFIX: Record<CameraId, string> = {
  1: "camera-recording-",
  2: "camera2-recording-",
  3: "camera3-recording-",
};

/**
 * Gemini-picked cut of the two camera takes, built by the highlight-reel worker
 * and looped on Screen 06. Same bucket and table as the raw takes — the prefix
 * is what keeps it out of the per-camera listings.
 */
export const HIGHLIGHT_FILENAME_PREFIX = "highlight-";

/** Which listing a screen wants out of the shared `video_recordings` table. */
export type RecordingSource = { camera: CameraId } | { highlight: true };

export function recordingFilenamePrefix(source: RecordingSource): string {
  return "camera" in source
    ? CAMERA_FILENAME_PREFIX[source.camera]
    : HIGHLIGHT_FILENAME_PREFIX;
}

export function recordingSourceQuery(source: RecordingSource): string {
  return "camera" in source ? `camera=${source.camera}` : "kind=highlight";
}

export const CAMERA_LABEL: Record<CameraId, string> = {
  1: "Camera 01",
  2: "Camera 02",
  3: "Camera 03",
};

/** Screen a camera's takes are looped on. */
export const CAMERA_SCREEN_PATH: Record<CameraId, string> = {
  1: "/screen1",
  2: "/screen2",
  3: "/screen3",
};

export function parseCameraId(value: string | null): CameraId | null {
  const parsed = Number(value);
  return CAMERA_IDS.includes(parsed as CameraId) ? (parsed as CameraId) : null;
}

export function cameraRecordingFilename(cameraId: CameraId, extension: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${CAMERA_FILENAME_PREFIX[cameraId]}${timestamp}.${extension}`;
}

export function cameraIdFromFilename(filename: string): CameraId | null {
  // Camera 3 & 2 first: "camera-recording-" would otherwise never be reached for it.
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[3])) return 3;
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[2])) return 2;
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[1])) return 1;
  return null;
}

export function otherCameraId(cameraId: CameraId): CameraId {
  return cameraId === 1 ? 2 : 1;
}

/**
 * Epoch ms encoded in a recording filename. The dashboard stamps both cameras
 * from the same clock at save time, so this is what pairs the two angles of one
 * take — more reliable than upload order or DB insert time.
 */
export function parseRecordingTimestamp(filename: string): number | null {
  const iso = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(filename);
  if (iso) {
    const parsed = Date.parse(`${iso[1]}T${iso[2]}:${iso[3]}:${iso[4]}.${iso[5]}Z`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  // Older takes were named by the API with a bare `Date.now()`.
  const epoch = /-(\d{13})\./.exec(filename);
  return epoch ? Number(epoch[1]) : null;
}

/**
 * Reel name derived from the camera take, so re-running the worker for the same
 * pair overwrites one object instead of piling up near-duplicates.
 */
export function highlightFilenameFor(cameraFilename: string): string {
  const stamp = cameraFilename
    .replace(CAMERA_FILENAME_PREFIX[2], "")
    .replace(CAMERA_FILENAME_PREFIX[1], "")
    .replace(/\.[^.]+$/, "");
  return `${HIGHLIGHT_FILENAME_PREFIX}${stamp}.mp4`;
}
