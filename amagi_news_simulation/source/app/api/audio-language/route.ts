import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIO_LANGUAGES, enqueueAudioConversion } from "@/lib/queue";
import { getTranscriptForLanguage } from "@/lib/transcript-language";
import { DEFAULT_VOICE_ID, VOICE_PROFILES, isVoiceId, voiceTaskType, type VoiceId } from "@/lib/voice-profiles";
import { voiceCacheKey } from "@/lib/voice-cache";

async function buildCatalogue(sourceAudio: string, voiceId: VoiceId) {
  const transcript = await prisma.transcript.findFirst({
    where: { sourceAudio }, orderBy: { createdAt: "desc" },
    include: { translations: { include: { audio: true } } },
  });
  const tasks = transcript?.generationId ? await prisma.generationTask.findMany({
    where: { generationId: transcript.generationId, taskType: { in: AUDIO_LANGUAGES.map(l => voiceTaskType(l.langCode, voiceId)) } },
  }) : [];
  return { exists: Boolean(transcript), voiceId, voices: VOICE_PROFILES,
    languages: [
      { language: "English", langCode: "en", url: sourceAudio, ready: true, translated: true, original: true, status: "ready" },
      ...AUDIO_LANGUAGES.map(({ language, langCode }) => {
        const translation = transcript?.translations.find(t => t.language === language);
        const audio = translation?.audio.find(a => a.variantKey === voiceCacheKey(translation.text, voiceId));
        const task = tasks.find(t => t.taskType === voiceTaskType(langCode, voiceId));
        return { language, langCode, voiceId, url: audio?.url ?? null, ready: Boolean(audio),
          translated: Boolean(translation), original: false,
          speakerGender: VOICE_PROFILES.find(v => v.id === voiceId)!.gender,
          voiceMode: "local-preset", status: audio ? "ready" : task?.status ?? "not-requested",
          error: audio ? null : task?.errorMessage ?? null };
      }),
    ],
  };
}
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const sourceAudio = req.nextUrl.searchParams.get("sourceAudio");
  const voiceId = req.nextUrl.searchParams.get("voiceId") ?? DEFAULT_VOICE_ID;
  if (!sourceAudio || !isVoiceId(voiceId)) return NextResponse.json({ error: "Valid sourceAudio and voiceId required" }, { status: 400 });
  try { return NextResponse.json(await buildCatalogue(sourceAudio, voiceId), { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list audio" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceAudio = body?.sourceAudio;
  const voiceId = body?.voiceId ?? DEFAULT_VOICE_ID;
  const target = AUDIO_LANGUAGES.find(l => l.language === body?.language);
  if (typeof sourceAudio !== "string" || !target || !isVoiceId(voiceId)) {
    return NextResponse.json({ error: "Valid sourceAudio, language and voiceId required" }, { status: 400 });
  }
  try {
    let transcript = await prisma.transcript.findFirst({
      where: { sourceAudio }, orderBy: { createdAt: "desc" },
      include: { translations: { include: { audio: true } } },
    });
    if (!transcript) return NextResponse.json({ error: "Transcribe this recording first" }, { status: 404 });
    if (!transcript.translations.some(t => t.language === target.language)) {
      await getTranscriptForLanguage(sourceAudio, target);
      transcript = await prisma.transcript.findUniqueOrThrow({
        where: { id: transcript.id }, include: { translations: { include: { audio: true } } },
      });
    }
    const translation = transcript.translations.find(t => t.language === target.language);
    if (!translation?.text.trim()) return NextResponse.json({ error: "No translated text available" }, { status: 409 });
    const variantKey = voiceCacheKey(translation.text, voiceId);
    if (!translation.audio.some(a => a.variantKey === variantKey)) {
      await enqueueAudioConversion(target.langCode, translation.id,
        decodeURIComponent(sourceAudio.split("/").pop() || ""), translation.text,
        transcript.generationId, { voiceId }, Boolean(body.retry));
    }
    return NextResponse.json(await buildCatalogue(sourceAudio, voiceId), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare speech" }, { status: 500 });
  }
}

