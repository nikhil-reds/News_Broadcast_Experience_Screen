import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** POST /api/ad-campaigns/impression — increment a campaign's impression count. */
export async function POST(req: NextRequest) {
  const { campaignId, code } = await req.json();
  if (!campaignId && !code) {
    return NextResponse.json({ error: "campaignId or code is required" }, { status: 400 });
  }

  try {
    const campaign = await prisma.adCampaign.update({
      where: campaignId ? { id: campaignId } : { code },
      data: { impressions: { increment: 1 } },
    });
    return NextResponse.json({ success: true, impressions: campaign.impressions });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to record impression";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
