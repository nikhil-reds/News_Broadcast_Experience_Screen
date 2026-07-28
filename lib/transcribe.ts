import { prisma } from "@/lib/prisma";
import {
  AUDIO_BUCKET,
  TRANSCRIPTS_BUCKET,
  getObjectBuffer,
  uploadObject,
} from "@/lib/minio";
import { enqueueTranslations } from "@/lib/queue";

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  filename: string;
  sourceAudio: string;
  text: string;
  duration: number;
  segments: TranscriptSegment[];
  sttEngine: string;
  txtUrl: string;
  txtObjectKey: string;
  transcriptId: string;
  createdAt: string;
  translationsQueued: boolean;
}

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(hrs)}:${p(mins)}:${p(secs)},${p(millis, 3)}`;
}

export function generateSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, idx) =>
        `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}\n`
    )
    .join("\n");
}

/**
 * Call the Docker Faster-Whisper container with raw audio bytes.
 * Whisper decodes/resamples internally, so no local ffmpeg is needed.
 */
export async function runWhisper(
  audioBuffer: Buffer,
  filename: string
): Promise<{ segments: TranscriptSegment[]; duration: number }> {
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
      const res = await fetch(whisperUrl, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;
      const data = await res.json();
      const duration = data.duration ? Number(Number(data.duration).toFixed(2)) : 0;

      if (Array.isArray(data.segments) && data.segments.length > 0) {
        const segments: TranscriptSegment[] = data.segments.map((s: any, idx: number) => ({
          id: idx,
          start: Number(Number(s.start || 0).toFixed(2)),
          end: Number(Number(s.end || 0).toFixed(2)),
          text: String(s.text || "").trim(),
        }));
        return { segments, duration };
      }
      // Whisper reachable but no speech detected.
      if (data && "segments" in data) return { segments: [], duration };
    } catch (err: any) {
      console.log(`Whisper endpoint ${whisperUrl} unavailable: ${err.message}`);
    }
  }
  return { segments: [], duration: 0 };
}

/**
 * Full pipeline for one audio object already stored in the MinIO `audio` bucket:
 * fetch bytes -> Whisper -> save English .txt to the `transcripts` bucket ->
 * persist Transcript + segments to Postgres.
 */
export async function transcribeAndStore(filename: string): Promise<TranscribeResult> {
  const audioBuffer = await getObjectBuffer(AUDIO_BUCKET, filename);
  const sourceAudio = `/api/asset/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`;

  const { segments, duration } = await runWhisper(audioBuffer, filename);
  const text = segments.map((s) => s.text).join(" ");
  const srtContent = generateSrt(segments);
  const sttEngine =
    segments.length > 0
      ? "Docker Live Faster-Whisper Container (Port 8000)"
      : "No speech detected";

  // Save the English transcript text file to MinIO (`transcripts` bucket).
  const txtObjectKey = `${filename}.txt`;
  await uploadObject(
    TRANSCRIPTS_BUCKET,
    txtObjectKey,
    Buffer.from(text, "utf-8"),
    "text/plain; charset=utf-8"
  );
  const txtUrl = `/api/asset/${TRANSCRIPTS_BUCKET}/${encodeURIComponent(txtObjectKey)}`;

  // Persist to Postgres.
  const audio = await prisma.audioFile.upsert({
    where: { filename },
    create: {
      filename,
      url: sourceAudio,
      bucket: AUDIO_BUCKET,
      objectKey: filename,
      size: audioBuffer.length,
      duration: duration || null,
    },
    update: { duration: duration || null, url: sourceAudio },
  });

  await prisma.transcript.deleteMany({ where: { audioFileId: audio.id } });
  const saved = await prisma.transcript.create({
    data: {
      sourceAudio,
      audioFileId: audio.id,
      language: "en",
      duration,
      sttEngine,
      text,
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

  // English .txt is saved and the transcript is persisted — fan out to the 4
  // per-language translation workers (german/hindi/french/spanish-transcript).
  // Best-effort: a queue/Redis outage must not fail the transcription itself.
  let translationsQueued = false;
  if (segments.length > 0) {
    try {
      await enqueueTranslations(filename, segments, saved.id);
      translationsQueued = true;
    } catch (err: any) {
      console.error(`Failed to enqueue translations for "${filename}": ${err.message}`);
    }
  }

  return {
    filename,
    sourceAudio,
    text,
    duration,
    segments,
    sttEngine,
    txtUrl,
    txtObjectKey,
    transcriptId: saved.id,
    createdAt: saved.createdAt.toISOString(),
    translationsQueued,
  };
}
