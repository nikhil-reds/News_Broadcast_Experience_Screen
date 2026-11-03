import { enqueueHighlightIfSessionComplete } from "@/lib/highlight-pairing";
import { withFlowWork } from "@/lib/flow-lifecycle";
import { cleanupSupersededGenerations, reconcileSavedFlow } from "@/lib/generation-cleanup";
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { enqueueTranscription } from "@/lib/queue";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

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
    const sessionId = (formData.get("sessionId") as string | null) || null;

    if (!sessionId) return NextResponse.json({ error: "Recording session is required" }, { status: 400 });
    if (!buffer.length) return NextResponse.json({ error: "Recording is empty" }, { status: 400 });
    return await withFlowWork(sessionId, async () => {
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
        sessionId,
      },
      update: {
        url,
        bucket: AUDIO_BUCKET,
        objectKey: filename,
        contentType,
        size: buffer.length,
        sessionId,
      },
    });

    await reconcileSavedFlow().catch(error => console.error("Flow retention will retry:", error));
    after(async () => { await cleanupSupersededGenerations().catch(error => console.error("Flow cleanup will retry:", error)); });
    await enqueueHighlightIfSessionComplete(sessionId).catch(error => console.error("Highlight pairing will retry:", error));
    // Recording is done and stored — enqueue a transcription job for the worker.
    // Best-effort: a Redis/worker outage must not fail the upload.
    let queued = false;
    try {
      await enqueueTranscription(filename, sessionId);
      queued = true;
    } catch (queueErr: unknown) {
      console.error("Failed to enqueue transcription job:", errorMessage(queueErr));
    }

    return NextResponse.json({
      success: true,
      message: "Audio uploaded to MinIO and saved to database",
      filename,
      filePath: url,
      url,
      size: buffer.length,
      queuedForTranscription: queued,
      createdAt: record.createdAt.toISOString(),
    });
    });
  } catch (error: unknown) {
    console.error("Error saving audio:", error);
    return NextResponse.json(
      { error: "Failed to save audio recording", details: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Optional: scope to one recording session (see save-recording's GET for
    // why this stays optional/backwards-compatible).
    const sessionId = req.nextUrl.searchParams.get("sessionId");

    const rows = await prisma.audioFile.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    const audioFiles = rows.map((r) => ({
      filename: r.filename,
      url: `/api/asset/${encodeURIComponent(r.bucket || AUDIO_BUCKET)}/${encodeURIComponent(r.objectKey || r.filename)}`,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ audioFiles }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

