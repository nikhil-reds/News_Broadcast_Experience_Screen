import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hashPassword, validateAdminUserInput } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/session";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  const users = await prisma.adminUser.findMany({
    select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const validation = validateAdminUserInput(body);
  if (!validation.data) return NextResponse.json({ error: "Please correct the highlighted fields.", fields: validation.errors }, { status: 400 });
  try {
    const user = await prisma.adminUser.create({
      data: {
        name: validation.data.name,
        email: validation.data.email,
        passwordHash: await hashPassword(validation.data.password),
        createdBy: session.email,
      },
      select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists.", fields: { email: "This email is already in use." } }, { status: 409 });
    }
    throw error;
  }
}
