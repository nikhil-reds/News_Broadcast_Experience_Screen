import { NextRequest, NextResponse } from "next/server";
import { getTranscriptForLanguage } from "@/lib/transcript-language";

/**
 * GET /api/transcript/spanish?sourceAudio=<url>
 * Returns the Spanish translation for that exact audio's transcript — served
 * from cache if the `spanish-transcript` background worker already computed
 * it, otherwise translated via Qwen on demand and cached for next time.
 */
export async function GET(req: NextRequest) {
  const sourceAudio = req.nextUrl.searchParams.get("sourceAudio");
  if (!sourceAudio) {
    return NextResponse.json({ error: "sourceAudio is required" }, { status: 400 });
  }

  try {
    const result = await getTranscriptForLanguage(sourceAudio, { language: "Spanish", langCode: "es" });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to get Spanish transcript", details: error.message },
      { status: 500 }
    );
  }
}
