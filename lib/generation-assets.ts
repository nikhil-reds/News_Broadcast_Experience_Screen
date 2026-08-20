import { prisma } from "@/lib/prisma";

/**
 * Resolves the actual asset URLs/text a screen should render for a given
 * (already-confirmed-ready) generation. Called by
 * app/api/screens/[screenId]/publication/route.ts only after
 * lib/generation.ts's computeScreenBaseStatus has decided the generation is
 * fully ready for that screen — this file never makes readiness decisions,
 * only looks up rows.
 */

const TRANSLATION_LANG_CODES = ["de", "hi", "fr", "es"] as const;

async function resolveReel(generationId: string) {
  const reel = await prisma.videoRecording.findFirst({
    where: { sessionId: generationId, filename: { startsWith: "highlight-" } },
    orderBy: { createdAt: "desc" },
  });
  return reel ? { videoUrl: reel.url, filename: reel.filename } : null;
}

async function resolveEnglishTranscript(generationId: string) {
  const transcript = await prisma.transcript.findFirst({
    where: { generationId },
    orderBy: { createdAt: "desc" },
    include: { segments: { orderBy: { segmentIndex: "asc" } } },
  });
  if (!transcript) return null;
  const audio = await prisma.audioFile.findFirst({
    where: { filename: transcript.sourceAudio },
    select: { url: true },
  });
  return {
    audioUrl: audio?.url ?? null,
    text: transcript.text,
    segments: transcript.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
  };
}

/** All 5 languages (English + the 4 translations) with their audio + text, for Screen 5's language ring. */
async function resolveAllLanguages(generationId: string) {
  const transcript = await prisma.transcript.findFirst({
    where: { generationId },
    orderBy: { createdAt: "desc" },
    include: {
      segments: { orderBy: { segmentIndex: "asc" } },
      translations: { include: { segments: { orderBy: { segmentIndex: "asc" } }, audio: true } },
    },
  });
  if (!transcript) return null;
  const englishAudio = await prisma.audioFile.findFirst({
    where: { filename: transcript.sourceAudio },
    select: { url: true },
  });

  const languages: Record<string, { audioUrl: string | null; text: string }> = {
    English: { audioUrl: englishAudio?.url ?? null, text: transcript.text },
  };
  for (const t of transcript.translations) {
    languages[t.language] = { audioUrl: t.audio?.url ?? null, text: t.text };
  }
  return { languages };
}

/** Reel + English/translated transcripts, for Screen 8's subtitle overlay. */
async function resolveReelWithTranscripts(generationId: string) {
  const reel = await resolveReel(generationId);
  if (!reel) return null;
  const languages = await resolveAllLanguages(generationId);
  return { ...reel, languages: languages?.languages ?? {} };
}

export async function resolveScreenAssets(
  screenId: number,
  generationId: string | null
): Promise<Record<string, unknown> | null> {
  if (!generationId) return null;
  switch (screenId) {
    case 4:
      return resolveEnglishTranscript(generationId);
    case 5:
      return resolveAllLanguages(generationId);
    case 6:
    case 9:
    case 10:
      return resolveReel(generationId);
    case 8:
      return resolveReelWithTranscripts(generationId);
    default:
      return null;
  }
}

/** For a specific TTS language, used by Screen 5's on-demand fallback path if needed. */
export function isKnownLangCode(code: string): code is (typeof TRANSLATION_LANG_CODES)[number] {
  return (TRANSLATION_LANG_CODES as readonly string[]).includes(code);
}
