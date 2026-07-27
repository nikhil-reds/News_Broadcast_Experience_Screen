import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const transcriptsDir = path.join(process.cwd(), "public", "transcripts");
    const jsonPath = path.join(transcriptsDir, "transcript.json");
    const srtPath = path.join(transcriptsDir, "transcript.srt");

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json(
        { exists: false, message: "No transcript available yet. Please trigger transcription." },
        { status: 444 }
      );
    }

    const jsonData = JSON.parse(await fs.promises.readFile(jsonPath, "utf-8"));
    const srtData = fs.existsSync(srtPath) ? await fs.promises.readFile(srtPath, "utf-8") : "";

    return NextResponse.json({
      exists: true,
      jsonUrl: "/transcripts/transcript.json",
      srtUrl: "/transcripts/transcript.srt",
      transcript: jsonData,
      srtContent: srtData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to read transcript file", details: error.message },
      { status: 500 }
    );
  }
}
