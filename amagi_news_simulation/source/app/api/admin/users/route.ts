import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hashPassword, validateAdminUserInput } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/session";
import { canAssignRole, ensureSystemRoles, forbidden, hasPermission, writeAudit } from "@/lib/rbac";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "users.read")) return forbidden();
  const users = await prisma.adminUser.findMany({
    select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, role: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "users.create")) return forbidden();
  const body = await request.json().catch(() => null);
  const validation = validateAdminUserInput(body);
  if (!validation.data) return NextResponse.json({ error: "Please correct the highlighted fields.", fields: validation.errors }, { status: 400 });
  await ensureSystemRoles();
  const requestedRoleId = typeof body?.roleId === "string" ? body.roleId : "";
  const role = await prisma.adminRole.findUnique({ where: { id: requestedRoleId } });
  if (!role) return NextResponse.json({ error: "Select a valid role.", fields: { roleId: "Select a valid role." } }, { status: 400 });
  if (!canAssignRole(session.permissions, role.permissions)) return forbidden();
  try {
    const user = await prisma.adminUser.create({
      data: {
        name: validation.data.name,
        email: validation.data.email,
        passwordHash: await hashPassword(validation.data.password),
        createdBy: session.email,
        roleId: role.id,
      },
      select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, role: { select: { id: true, name: true, slug: true } } },
    });
    await writeAudit(session.email, "user.created", "admin-user", user.id, { email: user.email, role: role.slug });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists.", fields: { email: "This email is already in use." } }, { status: 409 });
    }
    throw error;
  }
}
