import { NextRequest, NextResponse } from "next/server";
import { realtimeSelections } from "@/lib/realtime-selections";

type SelectionKind = keyof typeof realtimeSelections;

function isKind(value: string | null): value is SelectionKind {
  return value !== null && Object.hasOwn(realtimeSelections, value);
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!isKind(kind) || !isSessionId(sessionId)) {
    return NextResponse.json({ error: "Valid kind and sessionId are required" }, { status: 400 });
  }
  const state = await realtimeSelections[kind].get(sessionId);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { kind?: unknown; sessionId?: unknown; value?: unknown } | null;
  const kind = typeof body?.kind === "string" ? body.kind : null;
  if (!isKind(kind) || !isSessionId(body?.sessionId) || typeof body?.value !== "string" || !realtimeSelections[kind].allowed.includes(body.value as never)) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }
  const state = await realtimeSelections[kind].save(body.sessionId, body.value as never);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
