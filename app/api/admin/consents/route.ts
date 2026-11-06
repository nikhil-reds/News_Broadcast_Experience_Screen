import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { CONSENT_STATUSES, CONSENT_TYPES, type ConsentStatus, type ConsentType, validateConsentInput } from "@/lib/consent";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  await verifyAdminSession();
  const params = request.nextUrl.searchParams;
  const page = positiveInteger(params.get("page"), 1);
  const limit = positiveInteger(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const status = params.get("status");
  const consentType = params.get("type");
  const query = params.get("query")?.trim().slice(0, 160) ?? "";
  const where = {
    ...(status && CONSENT_STATUSES.includes(status as ConsentStatus) ? { status } : {}),
    ...(consentType && CONSENT_TYPES.includes(consentType as ConsentType) ? { consentType } : {}),
    ...(query ? { OR: [
      { participantName: { contains: query, mode: "insensitive" as const } },
      { participantEmail: { contains: query, mode: "insensitive" as const } },
      { scope: { contains: query, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.consent.findMany({ where, include: { events: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.consent.count({ where }),
  ]);
  return NextResponse.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSession();
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const validation = validateConsentInput(body);
  if (!validation.data) return NextResponse.json({ error: "Please correct the highlighted fields.", fields: validation.errors }, { status: 400 });
  const data = validation.data;

  const consent = await prisma.$transaction(async (tx) => {
    const created = await tx.consent.create({ data: { ...data, createdBy: session.email } });
    await tx.consentEvent.create({ data: { consentId: created.id, action: "created", toStatus: created.status, note: created.notes, performedBy: session.email } });
    return tx.consent.findUniqueOrThrow({ where: { id: created.id }, include: { events: { orderBy: { createdAt: "desc" } } } });
  });
  return NextResponse.json({ consent }, { status: 201 });
}
