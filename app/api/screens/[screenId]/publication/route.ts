import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SCREEN_REQUIREMENTS, VARIANT_SCREENS, computeScreenBaseStatus } from "@/lib/generation";
import { resolveScreenAssets } from "@/lib/generation-assets";

/**
 * GET /api/screens/[screenId]/publication — the ONE thing every screen
 * should poll instead of hand-rolling its own "newest X" lookup. Always
 * returns the last known-good ("current") content; a generation/variant that
 * isn't fully ready yet is never included here — see lib/generation.ts.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ screenId: string }> }) {
  const { screenId: screenIdParam } = await params;
  const screenId = Number(screenIdParam);
  if (!Number.isInteger(screenId)) {
    return NextResponse.json({ error: "screenId must be an integer" }, { status: 400 });
  }

  if (VARIANT_SCREENS.has(screenId)) {
    return NextResponse.json(await buildVariantResponse(screenId));
  }

  if (SCREEN_REQUIREMENTS[screenId]) {
    return NextResponse.json(await buildBaseResponse(screenId));
  }

  // Screens 1/2/3 (raw camera loops) have no derived pipeline to gate on.
  return NextResponse.json({
    status: "current",
    generationId: null,
    seq: null,
    progress: null,
    failureReason: null,
    assets: null,
  });
}

async function buildBaseResponse(screenId: number) {
  const base = await computeScreenBaseStatus(screenId);
  if (!base) {
    return { status: "waiting-for-reel", generationId: null, seq: null, progress: null, failureReason: null, assets: null };
  }
  const assets = base.generationId ? await resolveScreenAssets(screenId, base.generationId) : null;
  return { ...base, assets };
}

async function buildVariantResponse(screenId: number) {
  const pub = await prisma.screenPublication.findUnique({ where: { screenId } });
  if (!pub || !pub.currentGenerationId) {
    return {
      status: pub?.pendingStatus === "preparing" ? "preparing" : "waiting-for-reel",
      generationId: null,
      seq: null,
      progress: null,
      failureReason: pub?.pendingFailureReason ?? null,
      assets: null,
    };
  }
  const gen = await prisma.broadcastSession.findUnique({ where: { id: pub.currentGenerationId }, select: { seq: true } });
  return {
    status: pub.pendingStatus === "failed" ? "failed" : pub.pendingStatus === "preparing" ? "preparing" : "current",
    generationId: pub.currentGenerationId,
    seq: gen?.seq ?? null,
    progress: null,
    failureReason: pub.pendingStatus === "failed" ? pub.pendingFailureReason : null,
    // currentParams already carries the merged {language,aspect,backgroundId,...assetUrls} from publishVariant/setPendingVariant.
    assets: pub.currentParams ?? null,
  };
}
