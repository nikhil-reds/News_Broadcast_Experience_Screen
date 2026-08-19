import { NextRequest, NextResponse } from "next/server";
import { greenScreenQueue, greenScreenJobId } from "@/lib/queue";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";

/**
 * GET /api/green-screen/status?sourceFilename=<filename>
 *
 * Returns the status of all 5 background composition jobs for a given source video.
 * Used by Screen 07 to show which background swatches are ready and which are still rendering.
 *
 * Response:
 * {
 *   sourceFilename: "reel-xxx.mp4",
 *   backgroundsStatus: [
 *     { backgroundId: "newsroom-blue", status: "completed", progress: 100 },
 *     { backgroundId: "city-skyline", status: "processing", progress: 65 },
 *     { backgroundId: "world-map", status: "queued", progress: 0 },
 *     ...
 *   ],
 *   allReady: false,
 *   readyCount: 1
 * }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sourceFilename = searchParams.get("sourceFilename");

  if (!sourceFilename) {
    return NextResponse.json(
      { error: "sourceFilename is required" },
      { status: 400 }
    );
  }

  const backgroundsStatus = await Promise.all(
    GREEN_SCREEN_BACKGROUNDS.map(async (bg) => {
      const jobId = greenScreenJobId(bg.id, sourceFilename);
      const job = await greenScreenQueue.getJob(jobId);

      if (!job) {
        return {
          backgroundId: bg.id,
          label: bg.label,
          status: "not-queued",
          progress: 0,
        };
      }

      const state = await job.getState();
      const progress = job.progress || 0;

      return {
        backgroundId: bg.id,
        label: bg.label,
        status: state,
        progress: typeof progress === "number" ? progress : 0,
      };
    })
  );

  const readyCount = backgroundsStatus.filter((s) => s.status === "completed").length;
  const allReady = readyCount === GREEN_SCREEN_BACKGROUNDS.length;

  return NextResponse.json({
    sourceFilename,
    backgroundsStatus,
    allReady,
    readyCount,
  });
}
