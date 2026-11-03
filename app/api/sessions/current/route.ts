import { NextResponse } from "next/server";
import { currentBroadcastSession } from "@/lib/current-broadcast-session";

/**
 * GET /api/sessions/current — the session every screen should treat as "now."
 * Screens 1-6 (and eventually 7-12) resolve this first, then filter their own
 * recording/audio/transcript lookups by its id instead of just taking
 * whatever row is globally newest — that's what let Screen 4 show a
 * transcript from a different take than what Screens 1-3 were showing.
 */
export async function GET() {
  const session = await currentBroadcastSession();

  if (!session) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({ session });
}
