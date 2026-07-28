import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, uploadObject } from "@/lib/minio";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const customFilename = formData.get("filename") as string | null;
    const filename = customFilename || `master-audio-${timestamp}.wav`;
    const contentType = file.type || "audio/wav";

    // Store in the MinIO `audio` bucket
    await uploadObject(AUDIO_BUCKET, filename, buffer, contentType);

    const url = `/api/asset/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`;

    // Persist metadata to Postgres
    const record = await prisma.audioFile.upsert({
      where: { filename },
      create: {
        filename,
        url,
        bucket: AUDIO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
      },
      update: {
        url,
        bucket: AUDIO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Audio uploaded to MinIO and saved to database",
      filename,
      filePath: url,
      url,
      size: buffer.length,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Error saving audio:", error);
    return NextResponse.json(
      { error: "Failed to save audio recording", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const rows = await prisma.audioFile.findMany({
      orderBy: { createdAt: "desc" },
    });

    const audioFiles = rows.map((r) => ({
      filename: r.filename,
      url: r.url,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ audioFiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
