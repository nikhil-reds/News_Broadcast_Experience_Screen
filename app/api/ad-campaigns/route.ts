import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ad-campaigns — campaigns currently in their scheduled window,
 * highest priority first. Screens 09/10 poll this to drive their rotation.
 */
export async function GET() {
  const now = new Date();
  const campaigns = await prisma.adCampaign.findMany({
    where: { isActive: true, startTime: { lte: now }, endTime: { gte: now } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      sponsor: c.sponsor,
      text: c.text,
      code: c.code,
      priority: c.priority,
      impressions: c.impressions,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
    })),
  });
}

/** POST /api/ad-campaigns — create a campaign. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sponsor, text, code, startTime, endTime, priority } = body;

  if (!sponsor || !text || !code || !endTime) {
    return NextResponse.json(
      { error: "sponsor, text, code, and endTime are required" },
      { status: 400 }
    );
  }

  try {
    const campaign = await prisma.adCampaign.create({
      data: {
        sponsor,
        text,
        code,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: new Date(endTime),
        priority: typeof priority === "number" ? priority : 5,
      },
    });
    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: `Campaign code "${code}" already exists` }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to create campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
