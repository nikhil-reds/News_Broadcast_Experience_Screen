import * as Minio from "minio";

// Single MinIO client, cached on globalThis for dev hot-reload.
const globalForMinio = globalThis as unknown as { __minio?: Minio.Client };

export const minioClient =
  globalForMinio.__minio ??
  new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL || "false") === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "admin",
    secretKey: process.env.MINIO_SECRET_KEY || "password123",
  });

if (process.env.NODE_ENV !== "production") {
  globalForMinio.__minio = minioClient;
}

export const AUDIO_BUCKET = process.env.MINIO_BUCKET_AUDIO || "audio";
export const VIDEO_BUCKET = process.env.MINIO_BUCKET_VIDEO || "videos";
export const TRANSCRIPTS_BUCKET = process.env.MINIO_BUCKET_TRANSCRIPTS || "transcripts";
export const TTS_AUDIO_BUCKET = process.env.MINIO_BUCKET_TTS_AUDIO || "tts-audio";
export const ALLOWED_BUCKETS = new Set([AUDIO_BUCKET, VIDEO_BUCKET, TRANSCRIPTS_BUCKET, TTS_AUDIO_BUCKET]);

/** Create the bucket if it does not exist yet. */
export async function ensureBucket(bucket: string): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket);
    }
  } catch (err: any) {
    if (err.code === "BucketAlreadyOwnedByYou" || err.code === "BucketAlreadyExists") {
      return;
    }
    throw err;
  }
}

/** Upload a buffer to a bucket under the given object key. */
export async function uploadObject(
  bucket: string,
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<void> {
  await ensureBucket(bucket);
  await minioClient.putObject(
    bucket,
    key,
    buffer,
    buffer.length,
    contentType ? { "Content-Type": contentType } : undefined
  );
}

/** Generate a presigned GET URL (default 1 hour). */
export async function presignedGetUrl(
  bucket: string,
  key: string,
  expirySeconds = 3600
): Promise<string> {
  return minioClient.presignedGetObject(bucket, key, expirySeconds);
}

/** Stream an object straight to disk — for video, where buffering is wasteful. */
export async function downloadObjectToFile(
  bucket: string,
  key: string,
  destPath: string
): Promise<void> {
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const stream = await minioClient.getObject(bucket, key);
  await pipeline(stream, createWriteStream(destPath));
}

/**
 * True when this object exists AND is non-empty. The size check matters
 * separately — a killed ffmpeg upload can leave a 0-byte object that a plain
 * existence check reports as a cache hit, which the browser then refuses to
 * play (black <video> + an onError with no explanation).
 */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    const stat = await minioClient.statObject(bucket, key);
    return stat.size > 0;
  } catch {
    return false;
  }
}

/** Delete one object. Missing objects are treated as already-deleted, not an error. */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  try {
    await minioClient.removeObject(bucket, key);
  } catch (err: any) {
    if (err?.code === "NoSuchKey" || err?.code === "NotFound") return;
    throw err;
  }
}

/** Read an object fully into a Buffer. */
export async function getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
  const stream = await minioClient.getObject(bucket, key);
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
