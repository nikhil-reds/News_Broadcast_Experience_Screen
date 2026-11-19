import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, validateFeedbackInput } from "@/lib/feedback";
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
  const category = params.get("category");
  const query = params.get("query")?.trim().slice(0, 160) ?? "";
  const where = {
    ...(status && FEEDBACK_STATUSES.includes(status as (typeof FEEDBACK_STATUSES)[number]) ? { status } : {}),
    ...(category && FEEDBACK_CATEGORIES.includes(category as (typeof FEEDBACK_CATEGORIES)[number]) ? { category } : {}),
    ...(query ? { OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { email: { contains: query, mode: "insensitive" as const } },
      { message: { contains: query, mode: "insensitive" as const } },
    ] } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.feedback.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSession();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateFeedbackInput(body);
  if (!validation.data) {
    return NextResponse.json({ error: "Please correct the highlighted fields.", fields: validation.errors }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: { ...validation.data, submittedBy: session.email },
  });
  return NextResponse.json({ feedback }, { status: 201 });
}
