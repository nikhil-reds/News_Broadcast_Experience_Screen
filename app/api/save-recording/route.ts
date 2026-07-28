import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIDEO_BUCKET, uploadObject } from "@/lib/minio";

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

    return NextResponse.json({
      success: true,
      message: "Recording uploaded to MinIO and saved to database",
      filename,
      filePath: url,
      url,
      size: buffer.length,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Error saving recording:", error);
    return NextResponse.json(
      { error: "Failed to save recording", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const rows = await prisma.videoRecording.findMany({
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
