import { NextRequest, NextResponse } from "next/server";
import { greenScreenQueue, greenScreenJobId } from "@/lib/queue";
import {
  GREEN_SCREEN_BACKGROUNDS,
  composedFilename,
  composedMetadataFilename,
  matteAlphaFilename,
  matteForegroundFilename,
  matteMetadataFilename,
} from "@/lib/green-screen";
import { VIDEO_BUCKET, getObjectBuffer, objectExists } from "@/lib/minio";

/**
 * GET /api/green-screen/status?sourceFilename=<filename>
 *
 * Returns the status of the shared matte cache and all 5 background composition jobs for a given edited reel.
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

  const [matteForegroundReady, matteAlphaReady, matteMetadataReady] = await Promise.all([
    objectExists(VIDEO_BUCKET, matteForegroundFilename(sourceFilename)),
    objectExists(VIDEO_BUCKET, matteAlphaFilename(sourceFilename)),
    objectExists(VIDEO_BUCKET, matteMetadataFilename(sourceFilename)),
  ]);
  const matteReady = matteForegroundReady && matteAlphaReady && matteMetadataReady;

  const backgroundsStatus = await Promise.all(
    GREEN_SCREEN_BACKGROUNDS.map(async (bg) => {
      const outputReady = await objectExists(VIDEO_BUCKET, composedFilename(bg.id, sourceFilename));
      if (outputReady) {
        const metadata = await readCompositeMetadata(bg.id, sourceFilename);
        return {
          backgroundId: bg.id,
          label: bg.label,
          status: metadata?.fallback ? "fallback-ready" : "completed",
          progress: 100,
          fallback: metadata?.fallback ?? null,
          fallbackReason: metadata?.fallbackReason ?? null,
        };
      }

      const jobId = greenScreenJobId(bg.id, sourceFilename);
      const job = await greenScreenQueue.getJob(jobId);

      if (!job) {
        return {
          backgroundId: bg.id,
          label: bg.label,
          status: matteReady ? "matte-ready" : "matte-pending",
          progress: matteReady ? 50 : 0,
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

  const readyCount = backgroundsStatus.filter((s) => s.status === "completed" || s.status === "fallback-ready").length;
  const allReady = readyCount === GREEN_SCREEN_BACKGROUNDS.length;

  return NextResponse.json({
    sourceFilename,
    matteStatus: matteReady ? "MATTE_READY" : "MATTE_PENDING",
    backgroundsStatus,
    allReady,
    readyCount,
  });
}

async function readCompositeMetadata(backgroundId: string, sourceFilename: string) {
  try {
    const buf = await getObjectBuffer(VIDEO_BUCKET, composedMetadataFilename(backgroundId, sourceFilename));
    return JSON.parse(buf.toString("utf-8")) as { fallback?: string | null; fallbackReason?: string | null };
  } catch {
    return null;
  }
}
