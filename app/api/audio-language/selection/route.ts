import { NextRequest, NextResponse } from "next/server";
import {
  getAudioLanguageState,
  isAudioLanguageCode,
  saveAudioLanguageState,
} from "@/lib/audio-language-state";
import { prisma } from "@/lib/prisma";

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

function languageLabel(langCode: string) {
  return {
    en: "English",
    de: "German",
    hi: "Hindi",
    fr: "French",
    es: "Spanish",
  }[langCode] ?? "English";
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!validSessionId(sessionId)) {
    return NextResponse.json({ error: "Valid sessionId is required" }, { status: 400 });
  }

  const state = await getAudioLanguageState(sessionId);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sessionId, audioLanguage } = body as { sessionId?: unknown; audioLanguage?: unknown };

  if (!validSessionId(sessionId)) {
    return NextResponse.json({ error: "Valid sessionId is required" }, { status: 400 });
  }
  if (!isAudioLanguageCode(audioLanguage)) {
    return NextResponse.json({ error: "Invalid audio language" }, { status: 400 });
  }

  const state = await saveAudioLanguageState(sessionId, audioLanguage);
  await prisma.broadcastSession.update({
    where: { id: sessionId },
    data: { selectedAudioLanguage: languageLabel(audioLanguage) },
  });

  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
