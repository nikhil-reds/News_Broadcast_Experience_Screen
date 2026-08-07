import { NextRequest, NextResponse } from "next/server";
import { greenScreenQueue } from "@/lib/queue";
import { composedFilename, composedOutputUrl } from "@/lib/green-screen";
import { VIDEO_BUCKET, objectExists } from "@/lib/minio";

/**
 * Polled by Screen 07 while a background composite is rendering.
 * `?backgroundId=&sourceFilename=` (the same pair the POST was made with) are
 * required — a jobId alone can't be split back into its two parts (both can
 * contain hyphens), and the MinIO-existence fallback below needs both.
 *
 * Every response carries a `status` the client can act on — `completed`,
 * `failed`, or one of BullMQ's in-progress states. That matters: the client
 * keeps polling on anything it doesn't recognise as terminal, so a response
 * with no `status` at all (this route used to send a bare `{ error }` on 404)
 * left it re-requesting every 700ms forever.
 *
 * A `completed` job is only reported as such when its output is actually
 * still in MinIO. A completed job record can outlive the object it produced
 * (bucket cleared, object removed) — trusting the record alone would hand
 * the page a URL that 404's into a black <video>.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const backgroundId = req.nextUrl.searchParams.get("backgroundId");
  const sourceFilename = req.nextUrl.searchParams.get("sourceFilename");

  if (!backgroundId || !sourceFilename) {
    return NextResponse.json(
      { status: "failed", error: "backgroundId and sourceFilename query params are required" },
      { status: 400 }
    );
  }

  const outputFilename = composedFilename(backgroundId, sourceFilename);
  const outputUrl = composedOutputUrl(backgroundId, sourceFilename);

  try {
    const job = await greenScreenQueue.getJob(jobId);

    if (!job) {
      // BullMQ trims completed jobs after `removeOnComplete`; if the record is
      // gone but the object is in MinIO, the job still finished successfully.
      if (await objectExists(VIDEO_BUCKET, outputFilename)) {
        return NextResponse.json({ status: "completed", url: outputUrl });
      }
      return NextResponse.json(
        { status: "failed", error: "That compose job is no longer being tracked." },
        { status: 404 }
      );
    }

    const state = await job.getState();

    if (state === "completed") {
      const result = job.returnvalue as { url?: string } | undefined;

      if (!(await objectExists(VIDEO_BUCKET, outputFilename))) {
        return NextResponse.json({
          status: "failed",
          error:
            "This background rendered earlier but its cached file is gone. " +
            "Pick it again to re-render it.",
        });
      }

      return NextResponse.json({ status: "completed", url: result?.url ?? outputUrl });
    }

    if (state === "failed") {
      return NextResponse.json({
        status: "failed",
        error: job.failedReason || "Compositing failed",
      });
    }

    return NextResponse.json({ status: state }); // waiting | active | delayed | paused
  } catch (error) {
    console.error("Error polling green-screen job:", error);
    return NextResponse.json(
      {
        status: "failed",
        error: "Failed to check job status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
