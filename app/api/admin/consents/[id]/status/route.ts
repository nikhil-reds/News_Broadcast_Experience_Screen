import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { type ConsentStatus, validateStatusTransition } from "@/lib/consent";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await verifyAdminSession();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const existing = await prisma.consent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Consent not found." }, { status: 404 });
  if (input.expectedStatus !== existing.status) return NextResponse.json({ error: "Consent changed since it was opened. Refresh and try again." }, { status: 409 });
  const validation = validateStatusTransition(existing.status as ConsentStatus, input.status, input.effectiveAt, input.note);
  if (!validation.data) return NextResponse.json({ error: "This status change is not valid.", fields: validation.errors }, { status: 400 });
  if (["withdrawn", "expired"].includes(validation.data.status) && existing.grantedAt && validation.data.effectiveAt < existing.grantedAt) {
    return NextResponse.json({ error: "The effective date cannot be before consent was granted.", fields: { effectiveAt: "Choose a date on or after the granted date." } }, { status: 400 });
  }
  if (validation.data.status === "granted" && existing.expiresAt && existing.expiresAt <= validation.data.effectiveAt) {
    return NextResponse.json({ error: "The granted date must be before the recorded expiry date.", fields: { effectiveAt: "Choose a date before the expiry date." } }, { status: 400 });
  }

  try {
    const consent = await prisma.$transaction(async (tx) => {
      const update = await tx.consent.updateMany({
        where: { id, status: existing.status },
        data: {
          status: validation.data.status,
          ...(validation.data.status === "granted" ? { grantedAt: validation.data.effectiveAt } : {}),
          ...(validation.data.status === "withdrawn" ? { withdrawnAt: validation.data.effectiveAt } : {}),
          ...(validation.data.status === "expired" ? { expiresAt: validation.data.effectiveAt } : {}),
        },
      });
      if (update.count !== 1) throw new Error("CONSENT_CONFLICT");
      await tx.consentEvent.create({ data: { consentId: id, action: "status-changed", fromStatus: existing.status, toStatus: validation.data.status, note: validation.data.note, performedBy: session.email } });
      return tx.consent.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: "desc" } } } });
    });
    return NextResponse.json({ consent });
  } catch (error) {
    if (error instanceof Error && error.message === "CONSENT_CONFLICT") return NextResponse.json({ error: "Consent changed while it was being updated. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
