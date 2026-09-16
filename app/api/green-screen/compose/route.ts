import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueGreenScreenCompose } from "@/lib/queue";
import { composedFilename, composedMetadataFilename, composedOutputUrl, findBackground } from "@/lib/green-screen";
import { VIDEO_BUCKET, getObjectBuffer, objectExists } from "@/lib/minio";
import { publishVariant, setPendingVariant } from "@/lib/generation";

/** Screen 07 is the only screen this route ever serves. */
const SCREEN_ID = 7;

/**
 * Screen 07's "change the background" action.
 *
 * The composited clip is cached per (background, camera-1 take) pair in
 * MinIO, so most clicks (any repeat of a background already rendered against
 * the current take, including after a page reload) resolve instantly with
 * `status: "completed"` — no queue round-trip needed. A pair seen for the
 * first time enqueues a job on the green-screen-compose worker and hands
 * back a jobId for the page to poll at GET /api/green-screen/compose/[jobId].
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const backgroundId = body?.backgroundId;
    const sourceFilename = body?.sourceFilename;
    const intent = body?.intent === "select" ? "select" : "prewarm";

    if (typeof backgroundId !== "string" || !backgroundId) {
      return NextResponse.json({ error: "backgroundId is required" }, { status: 400 });
    }
    if (typeof sourceFilename !== "string" || !sourceFilename) {
      return NextResponse.json({ error: "sourceFilename is required" }, { status: 400 });
    }
    if (!sourceFilename.startsWith("highlight-")) {
      return NextResponse.json({ error: "sourceFilename must be an edited highlight reel" }, { status: 400 });
    }

    const background = findBackground(backgroundId);
    if (!background) {
      return NextResponse.json({ error: `Unknown background "${backgroundId}"` }, { status: 404 });
    }

    const recording = await prisma.videoRecording.findUnique({
      where: { filename: sourceFilename },
      select: { sessionId: true },
    });
    const generationId = recording?.sessionId ?? null;

    if (await objectExists(VIDEO_BUCKET, composedFilename(backgroundId, sourceFilename))) {
      const metadata = await readCompositeMetadata(backgroundId, sourceFilename);
      if (intent === "select" && generationId) {
        await setPendingVariant(SCREEN_ID, generationId, { backgroundId });
        await publishVariant(SCREEN_ID, generationId, { backgroundId }, {
          videoUrl: composedOutputUrl(backgroundId, sourceFilename),
        });
      }
      return NextResponse.json({
        status: metadata?.fallback ? "fallback-ready" : "completed",
        cached: true,
        url: composedOutputUrl(backgroundId, sourceFilename),
        fallback: metadata?.fallback ?? null,
        fallbackReason: metadata?.fallbackReason ?? null,
      });
    }

    if (intent === "select" && generationId) {
      await setPendingVariant(SCREEN_ID, generationId, { backgroundId });
    }

    // Each background/take pair needs its own job. A shared screen-level
    // debounce incorrectly gave every swatch request the final swatch's job,
    // leaving the other backgrounds permanently unable to render. The queue
    // job id already deduplicates identical pairs.
    const job = await enqueueGreenScreenCompose(backgroundId, sourceFilename, generationId);
    return NextResponse.json({ status: "queued", jobId: job.id });
  } catch (error) {
    console.error("Error enqueueing green-screen compose job:", error);
    return NextResponse.json(
      {
        error: "Failed to enqueue background composite",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function readCompositeMetadata(backgroundId: string, sourceFilename: string) {
  try {
    const buf = await getObjectBuffer(VIDEO_BUCKET, composedMetadataFilename(backgroundId, sourceFilename));
    return JSON.parse(buf.toString("utf-8")) as { fallback?: string | null; fallbackReason?: string | null };
  } catch {
    return null;
  }
}
