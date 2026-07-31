/**
 * Both cameras write into the same `video_recordings` table, so the filename
 * prefix is what says which camera a take came from. Camera 1 keeps the
 * original `camera-recording-` prefix — clips recorded before camera 2 existed
 * still belong to it, and Screen 01 keeps looping them.
 */
export const CAMERA_IDS = [1, 2] as const;

export type CameraId = (typeof CAMERA_IDS)[number];

export const CAMERA_FILENAME_PREFIX: Record<CameraId, string> = {
  1: "camera-recording-",
  2: "camera2-recording-",
};

export const CAMERA_LABEL: Record<CameraId, string> = {
  1: "Camera 01",
  2: "Camera 02",
};

/** Screen a camera's takes are looped on. */
export const CAMERA_SCREEN_PATH: Record<CameraId, string> = {
  1: "/screen1",
  2: "/screen2",
};

export function parseCameraId(value: string | null): CameraId | null {
  const parsed = Number(value);
  return CAMERA_IDS.includes(parsed as CameraId) ? (parsed as CameraId) : null;
}

export function cameraRecordingFilename(cameraId: CameraId, extension: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${CAMERA_FILENAME_PREFIX[cameraId]}${timestamp}.${extension}`;
}
