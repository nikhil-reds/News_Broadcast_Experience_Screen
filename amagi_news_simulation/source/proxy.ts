import { NextRequest, NextResponse } from "next/server";
import { savedDemoResponse } from "@/lib/saved-demo-api";

export async function proxy(request: NextRequest) {
  try { return await savedDemoResponse(request) ?? NextResponse.next(); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read demo state" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const config = {
  matcher: [
    "/api/screen-workflow", "/api/sessions/:path*", "/api/save-recording", "/api/save-audio",
    "/api/asset/:path*", "/api/asset-stream/:path*", "/api/audio-language/:path*", "/api/brightness/:path*",
    "/api/realtime-selections", "/api/transcript/:path*", "/api/transcribe", "/api/translate",
    "/api/subtitle-cues", "/api/green-screen/:path*", "/api/screens/:path*", "/api/video-export/:path*",
  ],
};
