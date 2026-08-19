import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/sessions/[id] — one session plus its linked recordings/audio. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.broadcastSession.findUnique({
    where: { id },
    include: { videoRecordings: true, audioFiles: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

/**
 * PATCH /api/sessions/[id] — updates the session's lifecycle status (set to
 * "processing"/endedAt when the operator presses "End Recording") and the
 * operator's Screen 07/08 selections (background, subtitle language) that
 * Screens 11/12 read when building the final export.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") data.status = body.status;
  if (body.endedAt !== undefined) data.endedAt = body.endedAt ? new Date(body.endedAt) : null;
  if (body.selectedBackgroundId !== undefined) data.selectedBackgroundId = body.selectedBackgroundId;
  if (typeof body.selectedSubtitleLanguage === "string") {
    data.selectedSubtitleLanguage = body.selectedSubtitleLanguage;
  }

  try {
    const session = await prisma.broadcastSession.update({ where: { id }, data });
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
