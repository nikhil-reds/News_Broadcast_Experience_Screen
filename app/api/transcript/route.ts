import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const sourceAudio = req.nextUrl.searchParams.get("sourceAudio");

    const row = await prisma.transcript.findFirst({
      where: sourceAudio ? { sourceAudio } : undefined,
      orderBy: { createdAt: "desc" },
      include: { segments: { orderBy: { segmentIndex: "asc" } } },
    });

    if (!row) {
      return NextResponse.json({ exists: false });
    }

    const transcript = {
      text: row.text,
      language: row.language,
      duration: row.duration,
      segments: row.segments.map((s) => ({
        id: s.segmentIndex,
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      createdAt: row.createdAt.toISOString(),
      sourceAudio: row.sourceAudio,
    };

    return NextResponse.json({
      exists: true,
      transcript,
      srtContent: row.srtContent || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to read transcript", details: error.message },
      { status: 500 }
    );
  }
}
