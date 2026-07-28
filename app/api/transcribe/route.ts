import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeAndStore } from "@/lib/transcribe";

export async function POST(req: NextRequest) {
  try {
    // ---- Resolve which audio object to transcribe -------------------------
    let filename: string | null = req.headers.get("x-audio-filename");
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body.filename) filename = body.filename;
    }

    // Fall back to the newest audio file in the database.
    if (!filename) {
      const newest = await prisma.audioFile.findFirst({ orderBy: { createdAt: "desc" } });
      filename = newest?.filename || null;
    }
    if (!filename) {
      return NextResponse.json({ error: "No audio file available to transcribe" }, { status: 400 });
    }

    const result = await transcribeAndStore(filename);

    return NextResponse.json({
      success: true,
      message: "Speech transcription complete and saved to database + MinIO.",
      masterAudio: result.sourceAudio,
      sttEngine: result.sttEngine,
      transcriptTxtUrl: result.txtUrl,
      transcript: {
        text: result.text,
        language: "en",
        duration: result.duration,
        segments: result.segments,
        createdAt: result.createdAt,
        sourceAudio: result.sourceAudio,
      },
    });
  } catch (error: any) {
    console.error("Transcribe API Error:", error);
    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    );
  }
}
