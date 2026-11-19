import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/session";
import { ensureSystemRoles, forbidden, hasPermission, PERMISSIONS, writeAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "roles.read")) return forbidden();
  await ensureSystemRoles();
  const roles = await prisma.adminRole.findMany({ include: { _count: { select: { users: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  return NextResponse.json({ roles, permissions: PERMISSIONS }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "roles.manage")) return forbidden();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const permissions = Array.isArray(body?.permissions) ? [...new Set(body.permissions.filter((item): item is string => typeof item === "string" && (PERMISSIONS as readonly string[]).includes(item)))] : [];
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "Enter a role name between 2 and 60 characters." }, { status: 400 });
  if (!permissions.length) return NextResponse.json({ error: "Select at least one permission." }, { status: 400 });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  try {
    const role = await prisma.adminRole.create({ data: { name, slug, description: description || null, permissions }, include: { _count: { select: { users: true } } } });
    await writeAudit(session.email, "role.created", "admin-role", role.id, { slug });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A role with this name already exists." }, { status: 409 });
    throw error;
  }
}
