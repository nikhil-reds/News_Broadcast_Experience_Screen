import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, getObjectBuffer } from "@/lib/minio";

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(hrs)}:${p(mins)}:${p(secs)},${p(millis, 3)}`;
}

function generateSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, idx) => `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}\n`)
    .join("\n");
}

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

    // ---- Pull the audio bytes from MinIO ----------------------------------
    let audioBuffer: Buffer;
    try {
      audioBuffer = await getObjectBuffer(AUDIO_BUCKET, filename);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Audio "${filename}" not found in storage`, details: err.message },
        { status: 404 }
      );
    }

    const sourceUrl = `/api/asset/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`;

    // ---- Docker Faster-Whisper (raw audio; it decodes/resamples itself) ----
    let segments: TranscriptSegment[] = [];
    let durationSec = 0;
    let sttEngineUsed = "Docker Live Faster-Whisper Container (Port 8000)";

    const whisperUrls = [
      process.env.WHISPER_DOCKER_URL || "http://localhost:8000/transcribe",
      "http://127.0.0.1:8000/transcribe",
      "http://whisper:8000/transcribe",
    ];

    for (const whisperUrl of whisperUrls) {
      try {
        const form = new FormData();
        form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), filename);
        form.append("task", "transcribe");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);
        const res = await fetch(whisperUrl, { method: "POST", body: form, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          segments = data.segments.map((s: any, idx: number) => ({
            id: idx,
            start: Number(Number(s.start || 0).toFixed(2)),
            end: Number(Number(s.end || 0).toFixed(2)),
            text: String(s.text || "").trim(),
          }));
          if (data.duration) durationSec = Number(Number(data.duration).toFixed(2));
          break;
        }
        // Whisper reachable but returned no speech — stop trying other URLs.
        if (data && "segments" in data) {
          if (data.duration) durationSec = Number(Number(data.duration).toFixed(2));
          break;
        }
      } catch (err: any) {
        console.log(`Whisper endpoint ${whisperUrl} unavailable: ${err.message}`);
      }
    }

    const fullText = segments.map((s) => s.text).join(" ");
    const srtContent = generateSrt(segments);

    // ---- Persist to Postgres ----------------------------------------------
    const audio = await prisma.audioFile.upsert({
      where: { filename },
      create: {
        filename,
        url: sourceUrl,
        bucket: AUDIO_BUCKET,
        objectKey: filename,
        size: audioBuffer.length,
        duration: durationSec || null,
      },
      update: { duration: durationSec || null, url: sourceUrl },
    });

    // Replace any previous transcript for this audio (segments cascade-delete).
    await prisma.transcript.deleteMany({ where: { audioFileId: audio.id } });
    const saved = await prisma.transcript.create({
      data: {
        sourceAudio: sourceUrl,
        audioFileId: audio.id,
        language: "en",
        duration: durationSec,
        sttEngine: sttEngineUsed,
        text: fullText,
        srtContent,
        segments: {
          create: segments.map((s, i) => ({
            segmentIndex: i,
            start: s.start,
            end: s.end,
            text: s.text,
          })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Speech transcription complete and saved to database.",
      masterAudio: sourceUrl,
      sttEngine: segments.length > 0 ? sttEngineUsed : "No speech detected",
      transcript: {
        text: fullText,
        language: "en",
        duration: durationSec,
        segments,
        createdAt: saved.createdAt.toISOString(),
        sourceAudio: sourceUrl,
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
