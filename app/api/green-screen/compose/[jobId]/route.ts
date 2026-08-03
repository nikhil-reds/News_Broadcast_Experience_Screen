import { NextRequest, NextResponse } from "next/server";
import { greenScreenQueue } from "@/lib/queue";
import { composedOutputUrl } from "@/lib/green-screen";
import { composedOutputExists } from "@/lib/green-screen-paths";

/**
 * Polled by Screen 07 while a background composite is rendering.
 *
 * Every response carries a `status` the client can act on — `completed`,
 * `failed`, or one of BullMQ's in-progress states. That matters: the client
 * keeps polling on anything it doesn't recognise as terminal, so a response
 * with no `status` at all (this route used to send a bare `{ error }` on 404)
 * left it re-requesting every 700ms forever.
 *
 * A `completed` job is only reported as such when its output is actually still
 * on disk. `public/generated/` is gitignored scratch space and gets wiped,
 * while the job record survives under `removeOnComplete` — trusting the record
 * alone handed the page a URL that 404'd into a black <video>.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const backgroundIdFromJobId = jobId.replace(/^greenscreen-/, "");

  try {
    const job = await greenScreenQueue.getJob(jobId);

    if (!job) {
      // BullMQ trims completed jobs after `removeOnComplete`; if the record is
      // gone but the file is on disk, the job still finished successfully.
      if (await composedOutputExists(backgroundIdFromJobId)) {
        return NextResponse.json({
          status: "completed",
          url: composedOutputUrl(backgroundIdFromJobId),
        });
      }
      return NextResponse.json(
        { status: "failed", error: "That compose job is no longer being tracked." },
        { status: 404 }
      );
    }

    const state = await job.getState();

    if (state === "completed") {
      const result = job.returnvalue as { backgroundId: string; url: string } | undefined;
      const backgroundId = result?.backgroundId ?? backgroundIdFromJobId;

      if (!(await composedOutputExists(backgroundId))) {
        return NextResponse.json({
          status: "failed",
          error:
            "This background rendered earlier but its cached file is gone. " +
            "Pick it again to re-render it.",
        });
      }

      return NextResponse.json({
        status: "completed",
        url: result?.url ?? composedOutputUrl(backgroundId),
      });
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
