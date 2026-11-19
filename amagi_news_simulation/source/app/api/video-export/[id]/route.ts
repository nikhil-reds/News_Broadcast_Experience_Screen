import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/video-export/[id] — Screen 11/12 polls this while a job renders. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const videoJob = await prisma.videoJob.findUnique({ where: { id } });
  if (!videoJob) {
    return NextResponse.json({ error: "Video job not found" }, { status: 404 });
  }
  return NextResponse.json({ videoJob });
}
