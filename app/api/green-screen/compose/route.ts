import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueGreenScreenCompose } from "@/lib/queue";
import { composedFilename, composedOutputUrl, findBackground } from "@/lib/green-screen";
import { VIDEO_BUCKET, objectExists } from "@/lib/minio";
import { setPendingVariant } from "@/lib/generation";
import { debounce } from "@/lib/debounce";

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

    if (typeof backgroundId !== "string" || !backgroundId) {
      return NextResponse.json({ error: "backgroundId is required" }, { status: 400 });
    }
    if (typeof sourceFilename !== "string" || !sourceFilename) {
      return NextResponse.json({ error: "sourceFilename is required" }, { status: 400 });
    }

    const background = findBackground(backgroundId);
    if (!background) {
      return NextResponse.json({ error: `Unknown background "${backgroundId}"` }, { status: 404 });
    }

    if (await objectExists(VIDEO_BUCKET, composedFilename(backgroundId, sourceFilename))) {
      return NextResponse.json({
        status: "completed",
        cached: true,
        url: composedOutputUrl(backgroundId, sourceFilename),
      });
    }

    const recording = await prisma.videoRecording.findUnique({
      where: { filename: sourceFilename },
      select: { sessionId: true },
    });
    const generationId = recording?.sessionId ?? null;

    if (generationId) {
      await setPendingVariant(SCREEN_ID, generationId, { backgroundId });
    }

    // Coalesce rapid swatch clicks: if the operator picks 4 backgrounds in
    // quick succession, only the last click's job should actually enqueue —
    // hence a per-SCREEN key (not per-background, which would let all 4 through).
    const job = await debounce(`green-screen:screen${SCREEN_ID}`, 700, () =>
      enqueueGreenScreenCompose(backgroundId, sourceFilename, generationId)
    );
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
