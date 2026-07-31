import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIDEO_BUCKET, uploadObject } from "@/lib/minio";
import {
  CAMERA_FILENAME_PREFIX,
  HIGHLIGHT_FILENAME_PREFIX,
  parseCameraId,
} from "@/lib/camera-recordings";
import { enqueueHighlightIfPairComplete } from "@/lib/highlight-pairing";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const customFilename = formData.get("filename") as string | null;
    const filename = customFilename || `camera-recording-${timestamp}.mp4`;
    const contentType = file.type || (filename.endsWith(".webm") ? "video/webm" : "video/mp4");

    // Store in the MinIO `videos` bucket
    await uploadObject(VIDEO_BUCKET, filename, buffer, contentType);

    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(filename)}`;

    // Persist metadata to Postgres
    const record = await prisma.videoRecording.upsert({
      where: { filename },
      create: {
        filename,
        url,
        bucket: VIDEO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
      },
      update: {
        url,
        bucket: VIDEO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
      },
    });

    // Both angles of a session are needed before the reel can be cut, so this
    // only enqueues once the counterpart take is already stored. Best-effort:
    // a Redis/worker outage must not fail the upload.
    let highlightQueued = false;
    try {
      const pair = await enqueueHighlightIfPairComplete(filename);
      highlightQueued = pair.queued;
      if (!pair.queued) {
        console.log(`No highlight job for "${filename}": ${pair.reason}`);
      }
    } catch (queueErr: any) {
      console.error("Failed to enqueue highlight-reel job:", queueErr.message);
    }

    return NextResponse.json({
      success: true,
      message: "Recording uploaded to MinIO and saved to database",
      filename,
      filePath: url,
      url,
      size: buffer.length,
      createdAt: record.createdAt.toISOString(),
      highlightQueued,
    });
  } catch (error: any) {
    console.error("Error saving recording:", error);
    return NextResponse.json(
      { error: "Failed to save recording", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Raw takes and Gemini-cut reels share this table; the filename prefix is
    // what separates them. `?camera=1|2` lists one camera's takes (camera 1
    // keeps the original prefix, so pre-existing recordings stay with it),
    // `?kind=highlight` lists the reels. No param still returns everything.
    const cameraId = parseCameraId(req.nextUrl.searchParams.get("camera"));
    const wantsHighlights = req.nextUrl.searchParams.get("kind") === "highlight";
    const prefix = wantsHighlights
      ? HIGHLIGHT_FILENAME_PREFIX
      : cameraId
        ? CAMERA_FILENAME_PREFIX[cameraId]
        : null;

    const rows = await prisma.videoRecording.findMany({
      where: prefix ? { filename: { startsWith: prefix } } : undefined,
      orderBy: { createdAt: "desc" },
    });

    const recordings = rows.map((r) => ({
      filename: r.filename,
      url: r.url,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ recordings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
