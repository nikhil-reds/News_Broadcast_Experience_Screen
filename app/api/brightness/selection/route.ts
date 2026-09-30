import { NextRequest, NextResponse } from "next/server";
import { getBrightnessState, isBrightness, saveBrightnessState } from "@/lib/brightness-state";
import { prisma } from "@/lib/prisma";

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!validSessionId(sessionId)) {
    return NextResponse.json({ error: "Valid sessionId is required" }, { status: 400 });
  }

  const state = await getBrightnessState(sessionId);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sessionId, brightness } = body as { sessionId?: unknown; brightness?: unknown };

  if (!validSessionId(sessionId)) {
    return NextResponse.json({ error: "Valid sessionId is required" }, { status: 400 });
  }
  if (!isBrightness(brightness)) {
    return NextResponse.json({ error: "Brightness must be an integer from 1 to 100" }, { status: 400 });
  }

  const state = await saveBrightnessState(sessionId, brightness);
  await prisma.broadcastSession.update({
    where: { id: sessionId },
    data: { selectedBrightness: brightness },
  });

  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
