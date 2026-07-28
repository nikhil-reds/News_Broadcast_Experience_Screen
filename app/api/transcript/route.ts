import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const transcriptsDir = path.join(process.cwd(), "public", "transcripts");
    const jsonPath = path.join(transcriptsDir, "transcript.json");
    const srtPath = path.join(transcriptsDir, "transcript.srt");

    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }

    if (!fs.existsSync(jsonPath)) {
      const defaultTranscript = {
        text: "Welcome to the evening news broadcast. Today we bring you top stories from around the globe, covering live interactive media processing, automated AI speech-to-text transcriptions, and real-time studio teleprompter displays.",
        language: "en",
        duration: 14,
        segments: [
          { id: 0, start: 0.0, end: 3.5, text: "Welcome to the evening news broadcast." },
          { id: 1, start: 3.5, end: 8.5, text: "Today we bring you top stories from around the globe, covering live interactive media processing." },
          { id: 2, start: 8.5, end: 14.0, text: "Automated AI speech-to-text transcriptions, and real-time studio teleprompter displays." }
        ],
        createdAt: new Date().toISOString(),
        sourceAudio: "/audio/master-audio.wav"
      };

      const defaultSrt = "1\n00:00:00,000 --> 00:00:03,500\nWelcome to the evening news broadcast.\n\n2\n00:00:03,500 --> 00:00:08,500\nToday we bring you top stories from around the globe, covering live interactive media processing.\n\n3\n00:00:08,500 --> 00:00:14,000\nAutomated AI speech-to-text transcriptions, and real-time studio teleprompter displays.\n";

      await fs.promises.writeFile(jsonPath, JSON.stringify(defaultTranscript, null, 2), "utf-8");
      await fs.promises.writeFile(srtPath, defaultSrt, "utf-8");
    }

    const jsonData = JSON.parse(await fs.promises.readFile(jsonPath, "utf-8"));
    const srtData = fs.existsSync(srtPath) ? await fs.promises.readFile(srtPath, "utf-8") : "";

    return NextResponse.json({
      exists: true,
      jsonUrl: "/transcripts/transcript.json",
      transcriptSrtUrl: "/transcripts/transcript.srt",
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
