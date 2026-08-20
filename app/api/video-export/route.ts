import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueVideoExport } from "@/lib/queue";
import { NO_BACKGROUND } from "@/lib/video-export";
import { setPendingVariant } from "@/lib/generation";
import { debounce } from "@/lib/debounce";

/**
 * POST /api/video-export — Screen 11/12's "Generate" action.
 *
 * Re-running the same (reel, language, aspect) combination reuses the
 * existing VideoJob row rather than piling up duplicates — if it already
 * completed, the caller gets that result back immediately.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { reelFilename, sourceAudio, language, aspect, backgroundId = NO_BACKGROUND } = body || {};

  if (!reelFilename || !sourceAudio || !language || !aspect) {
    return NextResponse.json(
      { error: "reelFilename, sourceAudio, language, and aspect are required" },
      { status: 400 }
    );
  }
  if (aspect !== "portrait" && aspect !== "landscape") {
    return NextResponse.json({ error: 'aspect must be "portrait" or "landscape"' }, { status: 400 });
  }

  // Screen mapping is fixed elsewhere in this codebase's screen structure.
  const screenId = aspect === "portrait" ? 11 : 12;

  const existing = await prisma.videoJob.findUnique({
    where: { reelFilename_language_aspect_backgroundId: { reelFilename, language, aspect, backgroundId } },
  });

  if (existing && (existing.status === "completed" || existing.status === "processing" || existing.status === "queued")) {
    return NextResponse.json({ videoJob: existing });
  }

  // The reel's own sessionId — populated going forward by a separate,
  // concurrent part of this refactor. Older reels won't have one; treat that
  // as legacy/no-generation rather than an error.
  const recording = await prisma.videoRecording.findUnique({
    where: { filename: reelFilename },
    select: { sessionId: true },
  });
  const generationId = recording?.sessionId ?? null;

  if (generationId) {
    await setPendingVariant(screenId, generationId, { language, aspect, backgroundId });
  }

  // Coalesce rapid config changes (language/aspect/background) into a single
  // enqueue: only the last request within the debounce window for this
  // screen actually creates/updates the VideoJob row and enqueues the export.
  const videoJob = await debounce(`video-export:screen${screenId}`, 700, async () => {
    const job = await prisma.videoJob.upsert({
      where: { reelFilename_language_aspect_backgroundId: { reelFilename, language, aspect, backgroundId } },
      create: { reelFilename, sourceAudio, language, aspect, backgroundId, status: "queued" },
      update: { sourceAudio, status: "queued", errorMessage: null },
    });

    try {
      await enqueueVideoExport({
        videoJobId: job.id,
        reelFilename,
        sourceAudio,
        language,
        aspect,
        backgroundId,
        generationId,
        screenId,
      });
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to enqueue export job";
      return prisma.videoJob.update({ where: { id: job.id }, data: { status: "failed", errorMessage: message } });
    }
  });

  if (videoJob.status === "failed") {
    return NextResponse.json({ error: videoJob.errorMessage ?? "Failed to enqueue export job" }, { status: 500 });
  }

  return NextResponse.json({ videoJob });
}

/** GET /api/video-export?reelFilename=&language=&aspect= — list matching jobs, newest first. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const reelFilename = searchParams.get("reelFilename") || undefined;
  const language = searchParams.get("language") || undefined;
  const aspect = searchParams.get("aspect") || undefined;

  const videoJobs = await prisma.videoJob.findMany({
    where: { reelFilename, language, aspect },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ videoJobs });
}
