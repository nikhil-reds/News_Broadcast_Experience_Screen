import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/sessions — called once, right when the operator presses the
 * single "Start Recording" button. The returned id is threaded into all 4
 * uploads (3 cameras + master audio) so the rest of the pipeline can group
 * them by sessionId instead of guessing from filename timestamps.
 */
export async function POST() {
  const session = await prisma.broadcastSession.create({
    data: { status: "recording" },
  });
  return NextResponse.json({ session });
}

/** GET /api/sessions — list sessions, newest first. Mainly for debugging/ops. */
export async function GET() {
  const sessions = await prisma.broadcastSession.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ sessions });
}
