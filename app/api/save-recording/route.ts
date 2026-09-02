import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIDEO_BUCKET, uploadObject } from "@/lib/minio";
import {
  CAMERA_FILENAME_PREFIX,
  HIGHLIGHT_FILENAME_PREFIX,
  parseCameraId,
} from "@/lib/camera-recordings";
import { enqueueHighlightIfSessionComplete } from "@/lib/highlight-pairing";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

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
    const sessionId = (formData.get("sessionId") as string | null) || null;

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
        sessionId,
      },
      update: {
        url,
        bucket: VIDEO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
        sessionId,
      },
    });

    // All 3 camera takes are needed before the reel can be cut, so this only
    // enqueues once the last of the three (for this sessionId) lands.
    // Best-effort: a Redis/worker outage must not fail the upload.
    let highlightQueued = false;
    try {
      const pair = await enqueueHighlightIfSessionComplete(sessionId);
      highlightQueued = pair.queued;
      if (!pair.queued) {
        console.log(`No highlight job for "${filename}": ${pair.reason}`);
      }
    } catch (queueErr: unknown) {
      console.error("Failed to enqueue highlight-reel job:", errorMessage(queueErr));
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
  } catch (error: unknown) {
    console.error("Error saving recording:", error);
    return NextResponse.json(
      { error: "Failed to save recording", details: errorMessage(error) },
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
    // Optional: scope to one recording session (see BroadcastSession). Left
    // out for recordings uploaded before sessions existed, or when the caller
    // doesn't know the session yet — falls back to "newest matching row"
    // exactly like before.
    const sessionId = req.nextUrl.searchParams.get("sessionId");

    const rows = await prisma.videoRecording.findMany({
      where: {
        ...(prefix ? { filename: { startsWith: prefix } } : {}),
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const recordings = rows.map((r) => ({
      filename: r.filename,
      url: r.url,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ recordings }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
