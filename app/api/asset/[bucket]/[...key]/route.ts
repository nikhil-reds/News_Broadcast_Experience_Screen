import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_BUCKETS } from "@/lib/minio";

/**
 * Stable asset access: GET /api/asset/<bucket>/<objectKey>
 * Routes media through the same-origin range proxy. A MinIO presigned URL
 * contains the server's `localhost:9000`, which works on the PC but makes a
 * phone try to connect to itself rather than the PC.
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
    const safeKey = (key || []).map((part) => encodeURIComponent(part)).join("/");
    // Relative Location deliberately preserves the public host the browser
    // used (for example 10.190.55.126 on a hotspot), rather than Next dev's
    // internal 0.0.0.0 listener address.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: `/api/asset-stream/${encodeURIComponent(bucket)}/${safeKey}` },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Asset not found", details: err.message },
      { status: 404 }
    );
  }
}
