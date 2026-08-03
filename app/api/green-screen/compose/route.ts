import { NextRequest, NextResponse } from "next/server";
import { enqueueGreenScreenCompose } from "@/lib/queue";
import { composedOutputUrl, findBackground } from "@/lib/green-screen";
import { composedOutputExists } from "@/lib/green-screen-paths";

/**
 * Screen 07's "change the background" action.
 *
 * The composited clip is cached per background id on disk, so most clicks
 * (any repeat of a background already rendered this session, including after
 * a page reload) resolve instantly with `status: "completed"` — no queue
 * round-trip needed. A background seen for the first time enqueues a job on
 * the green-screen-compose worker and hands back a jobId for the page to
 * poll at GET /api/green-screen/compose/[jobId].
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const backgroundId = body?.backgroundId;

    if (typeof backgroundId !== "string" || !backgroundId) {
      return NextResponse.json({ error: "backgroundId is required" }, { status: 400 });
    }

    const background = findBackground(backgroundId);
    if (!background) {
      return NextResponse.json({ error: `Unknown background "${backgroundId}"` }, { status: 404 });
    }

    if (await composedOutputExists(backgroundId)) {
      return NextResponse.json({
        status: "completed",
        cached: true,
        url: composedOutputUrl(backgroundId),
      });
    }

    const job = await enqueueGreenScreenCompose(backgroundId);
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
