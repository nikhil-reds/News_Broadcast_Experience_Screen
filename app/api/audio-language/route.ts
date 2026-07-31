import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIO_LANGUAGES, enqueueAudioConversion } from "@/lib/queue";
import { getTranscriptForLanguage } from "@/lib/transcript-language";

/**
 * Audio-language catalogue for Screen 05.
 *
 * Every language a broadcast can be *heard* in, keyed by the exact audio the
 * screen is playing:
 *
 *   English  → the original recording itself
 *   others   → the CosyVoice 2 take produced from that language's translation
 *              (lib/audio-conversion-worker.ts), if it has been synthesized yet
 *
 * GET  returns the catalogue with a `ready` flag per language.
 * POST kicks off whatever is still missing for one language (translation via
 *      Qwen, then the TTS job) so the screen can poll GET until it turns ready.
 */

export interface AudioLanguageEntry {
  language: string;
  langCode: string;
  /** Playable URL, or null while the take is still being produced. */
  url: string | null;
  /** True when `url` can be handed to an <audio> element right now. */
  ready: boolean;
  /** True once the text translation exists — TTS may still be running. */
  translated: boolean;
  /** True for the original recording, which needs no processing. */
  original: boolean;
}

function filenameFromSourceAudio(sourceAudio: string): string {
  return decodeURIComponent(sourceAudio.split("/").pop() || "");
}

async function buildCatalogue(sourceAudio: string): Promise<{
  exists: boolean;
  languages: AudioLanguageEntry[];
}> {
  const transcript = await prisma.transcript.findFirst({
    where: { sourceAudio },
    orderBy: { createdAt: "desc" },
    include: { translations: { include: { audio: true } } },
  });

  const english: AudioLanguageEntry = {
    language: "English",
    langCode: "en",
    url: sourceAudio,
    ready: true,
    translated: true,
    original: true,
  };

  const languages = AUDIO_LANGUAGES.map(({ language, langCode }) => {
    const translation = transcript?.translations.find((t) => t.language === language);
    return {
      language,
      langCode,
      url: translation?.audio?.url ?? null,
      ready: Boolean(translation?.audio?.url),
      translated: Boolean(translation),
      original: false,
    };
  });

  return { exists: Boolean(transcript), languages: [english, ...languages] };
}

/** GET /api/audio-language?sourceAudio=<url> */
export async function GET(req: NextRequest) {
  const sourceAudio = req.nextUrl.searchParams.get("sourceAudio");
  if (!sourceAudio) {
    return NextResponse.json({ error: "sourceAudio is required" }, { status: 400 });
  }

  try {
    const catalogue = await buildCatalogue(sourceAudio);
    return NextResponse.json({ sourceAudio, ...catalogue });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to list audio languages", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audio-language  { sourceAudio, language }
 *
 * Makes sure the requested language is on its way: translates the transcript
 * if that has not happened yet (which itself queues the TTS job), and re-queues
 * the TTS job when a translation exists but its audio never got synthesized.
 * Returns immediately with the current catalogue — synthesis is a background
 * job, so the caller polls GET.
 */
export async function POST(req: NextRequest) {
  let body: { sourceAudio?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceAudio, language } = body;
  if (!sourceAudio || !language) {
    return NextResponse.json({ error: "sourceAudio and language are required" }, { status: 400 });
  }

  const target = AUDIO_LANGUAGES.find((l) => l.language === language);
  if (!target) {
    return NextResponse.json(
      { error: `"${language}" has no audio conversion pipeline` },
      { status: 400 }
    );
  }

  try {
    const transcript = await prisma.transcript.findFirst({
      where: { sourceAudio },
      orderBy: { createdAt: "desc" },
      include: { translations: { include: { audio: true } } },
    });
    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript for this audio yet — transcribe it first" },
        { status: 404 }
      );
    }

    let translation = transcript.translations.find((t) => t.language === language);

    // No translation yet: this both persists it and queues the TTS job.
    if (!translation) {
      await getTranscriptForLanguage(sourceAudio, {
        language: target.language,
        langCode: target.langCode,
      });
      const refreshed = await prisma.transcriptTranslation.findUnique({
        where: { transcriptId_language: { transcriptId: transcript.id, language } },
        include: { audio: true },
      });
      translation = refreshed ?? undefined;
    } else if (!translation.audio && translation.text.trim()) {
      // Translated earlier, but the speech never landed (worker down at the
      // time, or the job was dropped) — hand it to the TTS worker again.
      await enqueueAudioConversion(
        target.langCode,
        translation.id,
        filenameFromSourceAudio(sourceAudio),
        translation.text
      );
    }

    const catalogue = await buildCatalogue(sourceAudio);
    return NextResponse.json({ sourceAudio, requested: language, ...catalogue });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to prepare ${language} audio`, details: error.message },
      { status: 500 }
    );
  }
}
