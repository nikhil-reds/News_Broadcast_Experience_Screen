import { NextRequest, NextResponse } from "next/server";
import { getTranscriptForLanguage } from "@/lib/transcript-language";

/** GET /api/transcript/english?sourceAudio=<url> — the original English transcript for one audio. */
export async function GET(req: NextRequest) {
  const sourceAudio = req.nextUrl.searchParams.get("sourceAudio");
  if (!sourceAudio) {
    return NextResponse.json({ error: "sourceAudio is required" }, { status: 400 });
  }

  try {
    const result = await getTranscriptForLanguage(sourceAudio, null);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to read transcript", details: error.message },
      { status: 500 }
    );
  }
}
