import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { ALLOWED_BUCKETS, minioClient } from "@/lib/minio";

/**
 * Same-origin asset streaming: GET /api/asset-stream/<bucket>/<objectKey>
 *
 * `/api/asset` 302-redirects to a presigned MinIO URL, which is the right call
 * for plain playback — the browser talks to MinIO directly and range requests
 * cost this server nothing. It is the wrong call when the page needs to *read*
 * the samples: a cross-origin media element taints the Web Audio graph, so
 * createMediaElementSource() emits zeroes and any analyser hanging off it reads
 * pure silence. Proxying the bytes keeps the element same-origin so the
 * analyser sees the real waveform.
 *
 * Prefer /api/asset for anything that is only played back — video especially,
 * which has no business being funnelled through Node.
 */

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
};

function guessContentType(objectKey: string) {
  const extension = objectKey.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** Parse a single-range `bytes=` header against a known object size. */
function parseRange(header: string | null, size: number) {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { unsatisfiable: true as const };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { unsatisfiable: true as const };

  // A suffix range ("bytes=-500") asks for the last N bytes.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { unsatisfiable: true as const };
  }

  return { start, end, unsatisfiable: false as const };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket, key } = await params;

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 404 });
  }

  const objectKey = decodeURIComponent((key || []).join("/"));
  if (!objectKey) {
    return NextResponse.json({ error: "Missing object key" }, { status: 400 });
  }

  try {
    const stat = await minioClient.statObject(bucket, objectKey);
    const size = stat.size;
    const contentType = stat.metaData?.["content-type"] || guessContentType(objectKey);

    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };
    if (stat.etag) baseHeaders.ETag = `"${stat.etag}"`;
    if (stat.lastModified) baseHeaders["Last-Modified"] = stat.lastModified.toUTCString();

    const range = parseRange(req.headers.get("range"), size);

    if (range?.unsatisfiable) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const length = end - start + 1;

    const nodeStream = range
      ? await minioClient.getPartialObject(bucket, objectKey, start, length)
      : await minioClient.getObject(bucket, objectKey);

    const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(length),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Asset not found", details }, { status: 404 });
  }
}
