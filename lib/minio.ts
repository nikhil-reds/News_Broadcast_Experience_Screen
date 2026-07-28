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
export const ALLOWED_BUCKETS = new Set([AUDIO_BUCKET, VIDEO_BUCKET, TRANSCRIPTS_BUCKET]);

/** Create the bucket if it does not exist yet. */
export async function ensureBucket(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(bucket);
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
