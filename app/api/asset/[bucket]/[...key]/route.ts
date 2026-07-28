import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_BUCKETS, presignedGetUrl } from "@/lib/minio";

/**
 * Stable asset access: GET /api/asset/<bucket>/<objectKey>
 * Generates a short-lived MinIO presigned URL and 302-redirects to it so the
 * browser streams the object directly from MinIO (supports range requests for
 * <audio>/<video> seeking) while credentials stay server-side.
 */
export async function GET(
  _req: NextRequest,
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
    const url = await presignedGetUrl(bucket, objectKey, 3600);
    return NextResponse.redirect(url, 302);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Asset not found", details: err.message },
      { status: 404 }
    );
  }
}
