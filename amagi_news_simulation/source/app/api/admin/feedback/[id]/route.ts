import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  await verifyAdminSession();
  const { id } = await params;
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  return NextResponse.json({ feedback });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  await verifyAdminSession();
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const status = body && typeof body === "object" && "status" in body ? (body as { status?: unknown }).status : undefined;
  if (typeof status !== "string" || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
    return NextResponse.json({ error: "Select a valid status." }, { status: 400 });
  }
  const exists = await prisma.feedback.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  const feedback = await prisma.feedback.update({ where: { id }, data: { status } });
  return NextResponse.json({ feedback });
}
