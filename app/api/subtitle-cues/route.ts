import { NextRequest, NextResponse } from "next/server";
import { getRemappedCuesForReel } from "@/lib/video-export";

/**
 * GET /api/subtitle-cues?reelFilename=&sourceAudio=&language=
 *
 * Screen 08's live subtitle-over-video preview. Returns that language's
 * transcript cues re-timed onto the reel's own cut timeline (see
 * lib/video-export.ts's doc comment for why that re-timing is necessary) —
 * the same cues Screen 11/12's export burns in, just consumed as JSON here
 * instead of pre-rendered PNGs, so the browser can show them without waiting
 * on an ffmpeg render.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const reelFilename = searchParams.get("reelFilename");
  const sourceAudio = searchParams.get("sourceAudio");
  const language = searchParams.get("language") || "English";

  if (!reelFilename || !sourceAudio) {
    return NextResponse.json(
      { error: "reelFilename and sourceAudio are required" },
      { status: 400 }
    );
  }

  try {
    const cues = await getRemappedCuesForReel({ reelFilename, sourceAudio, language });
    return NextResponse.json({ cues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute subtitle cues";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
