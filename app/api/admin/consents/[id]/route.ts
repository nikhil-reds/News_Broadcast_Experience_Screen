import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  await verifyAdminSession();
  const { id } = await params;
  const consent = await prisma.consent.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: "desc" } } } });
  if (!consent) return NextResponse.json({ error: "Consent not found." }, { status: 404 });
  return NextResponse.json({ consent });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  await verifyAdminSession();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const data: { participantEmail?: string | null; scope?: string; notes?: string | null; expiresAt?: Date | null } = {};
  const errors: Record<string, string> = {};
  if ("participantEmail" in input) {
    const value = typeof input.participantEmail === "string" ? input.participantEmail.trim().toLowerCase() : "";
    if (value && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)) errors.participantEmail = "Enter a valid email address.";
    else data.participantEmail = value || null;
  }
  if ("scope" in input) {
    const value = typeof input.scope === "string" ? input.scope.trim() : "";
    if (value.length < 10 || value.length > 5000) errors.scope = "Enter a scope between 10 and 5,000 characters."; else data.scope = value;
  }
  for (const key of ["notes"] as const) if (key in input) {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    const maximum = 5000;
    if (value.length > maximum) errors[key] = `Notes cannot exceed ${maximum.toLocaleString()} characters.`; else data[key] = value || null;
  }
  if ("expiryPreset" in input) {
    const durations: Record<string, number> = { "24-hours": 24 * 60 * 60 * 1000, "7-days": 7 * 24 * 60 * 60 * 1000, "30-days": 30 * 24 * 60 * 60 * 1000 };
    const preset = typeof input.expiryPreset === "string" ? input.expiryPreset : "";
    if (!durations[preset]) errors.expiryPreset = "Select a valid expiry period.";
    else data.expiresAt = new Date(Date.now() + durations[preset]);
  }
  if (!Object.keys(data).length && !Object.keys(errors).length) errors.request = "No editable fields were provided.";
  if (Object.keys(errors).length) return NextResponse.json({ error: "Please correct the highlighted fields.", fields: errors }, { status: 400 });
  const existing = await prisma.consent.findUnique({ where: { id }, select: { id: true, grantedAt: true } });
  if (!existing) return NextResponse.json({ error: "Consent not found." }, { status: 404 });
  if (data.expiresAt && existing.grantedAt && data.expiresAt <= existing.grantedAt) return NextResponse.json({ error: "Expiry must be after the granted date.", fields: { expiresAt: "Expiry must be after the granted date." } }, { status: 400 });
  const consent = await prisma.consent.update({ where: { id }, data, include: { events: { orderBy: { createdAt: "desc" } } } });
  return NextResponse.json({ consent });
}
