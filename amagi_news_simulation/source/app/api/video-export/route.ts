import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueVideoExport } from "@/lib/queue";
import { NO_BACKGROUND } from "@/lib/video-export";
import { setPendingVariant, publishVariant } from "@/lib/generation";
import { getAudioLanguageState } from "@/lib/audio-language-state";
import { DEFAULT_VOICE_ID, CHATTERBOX_REVISION } from "@/lib/voice-profiles";
import { EXPORT_AUDIO_LABELS, isExportAudioLanguage, type ExportAudioLanguage } from "@/lib/export-settings";
import { exportIdentity } from "@/lib/export-identity";
import { minioClient, VIDEO_BUCKET, objectExists } from "@/lib/minio";
import { findBackground } from "@/lib/green-screen";
import { currentBroadcastSession } from "@/lib/current-broadcast-session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.reelFilename !== "string" || typeof body.sourceAudio !== "string" ||
      !["portrait", "landscape"].includes(body.aspect)) {
    return NextResponse.json({ error: "Valid reelFilename, sourceAudio and aspect are required" }, { status: 400 });
  }
  try {
    const { reelFilename, sourceAudio, aspect } = body;
    // Snapshot the same current-session selection used by Screens 5 and 7.
    const session = await currentBroadcastSession();
    const selection = session ? await getAudioLanguageState(session.id) : null;
    const savedCode = Object.entries(EXPORT_AUDIO_LABELS).find(([, label]) => label === session?.selectedAudioLanguage)?.[0];
    const audioLanguage: ExportAudioLanguage = selection?.audioLanguage ?? (isExportAudioLanguage(savedCode) ? savedCode : "en");
    const voiceId = audioLanguage === "en" ? "original" as const : selection?.voiceId ?? DEFAULT_VOICE_ID;
    if ((body.audioLanguage !== undefined && body.audioLanguage !== audioLanguage) ||
        (body.voiceId !== undefined && body.voiceId !== voiceId)) {
      return NextResponse.json({ error: "The audio selection changed. Refresh the export settings and generate again." }, { status: 409 });
    }
    const language = body.language ?? EXPORT_AUDIO_LABELS[audioLanguage];
    if (!Object.values(EXPORT_AUDIO_LABELS).includes(language)) return NextResponse.json({ error: "Unsupported subtitle language" }, { status: 400 });
    const backgroundId = body.backgroundId ?? session?.selectedBackgroundId ?? NO_BACKGROUND;
    if (typeof backgroundId !== "string" || (backgroundId !== NO_BACKGROUND && !findBackground(backgroundId))) {
      return NextResponse.json({ error: "Invalid background" }, { status: 400 });
    }
    const [recording, transcript] = await Promise.all([
      prisma.videoRecording.findUnique({ where: { filename: reelFilename } }),
      prisma.transcript.findFirst({ where: { sourceAudio }, orderBy: { createdAt: "desc" }, include: { translations: true } }),
    ]);
    if (!recording || !transcript) return NextResponse.json({ error: "A saved reel and its transcript are required" }, { status: 404 });
    if (recording.sessionId && transcript.generationId && recording.sessionId !== transcript.generationId) {
      return NextResponse.json({ error: "The selected source audio belongs to another recording session" }, { status: 409 });
    }
    const stat = await minioClient.statObject(VIDEO_BUCKET, reelFilename);
    const translation = transcript.translations.find(t => t.language === language);
    const exportKey = exportIdentity({ reelFilename, reelEtag: stat.etag, sourceAudio,
      transcriptVersion: `${transcript.id}:${transcript.updatedAt.toISOString()}:${translation?.updatedAt.toISOString() ?? ""}`,
      language, aspect, backgroundId, audioLanguage, voiceId });
    const generationId = recording.sessionId;
    const screenId = aspect === "portrait" ? 11 : 12;
    const variant = { language, aspect, backgroundId, audioLanguage, voiceId, exportKey };
    if (generationId) await setPendingVariant(screenId, generationId, variant);
    const existing = await prisma.videoJob.findUnique({ where: { exportKey } });
    if (existing?.status === "completed" && existing.outputFilename && await objectExists(VIDEO_BUCKET, existing.outputFilename)) {
      if (generationId) await publishVariant(screenId, generationId, variant,
        { outputUrl: existing.outputUrl, outputFilename: existing.outputFilename, size: existing.size });
      return NextResponse.json({ videoJob: existing, cached: true });
    }
    const videoJob = await prisma.videoJob.upsert({
      where: { exportKey },
      create: { reelFilename, sourceAudio, language, aspect, backgroundId, audioLanguage, voiceId, exportKey,
        modelRevision: voiceId === "original" ? "original" : CHATTERBOX_REVISION, status: "queued", generationId },
      update: { status: existing?.status === "processing" ? "processing" : "queued", errorMessage: null },
    });
    await enqueueVideoExport({ videoJobId: videoJob.id, reelFilename, sourceAudio, language, aspect,
      backgroundId, generationId, screenId, audioLanguage, voiceId, exportKey });
    return NextResponse.json({ videoJob });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start export" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const videoJobs = await prisma.videoJob.findMany({
    where: { reelFilename: p.get("reelFilename") || undefined, language: p.get("language") || undefined,
      aspect: p.get("aspect") || undefined, audioLanguage: p.get("audioLanguage") || undefined,
      voiceId: p.get("voiceId") || undefined },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  return NextResponse.json({ videoJobs }, { headers: { "Cache-Control": "no-store" } });
}

