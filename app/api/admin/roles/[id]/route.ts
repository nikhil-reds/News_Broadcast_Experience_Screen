import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { forbidden, hasPermission, PERMISSIONS, writeAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/roles/[id]">) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "roles.manage")) return forbidden();
  const { id } = await context.params;
  const current = await prisma.adminRole.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (current.isSystem) return NextResponse.json({ error: "System roles are protected and cannot be changed." }, { status: 409 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : current.name;
  const description = typeof body?.description === "string" ? body.description.trim() : current.description;
  const permissions = Array.isArray(body?.permissions) ? [...new Set(body.permissions.filter((item): item is string => typeof item === "string" && (PERMISSIONS as readonly string[]).includes(item)))] : current.permissions;
  if (name.length < 2 || name.length > 60 || !permissions.length) return NextResponse.json({ error: "A valid name and at least one permission are required." }, { status: 400 });
  const role = await prisma.adminRole.update({ where: { id }, data: { name, description, permissions }, include: { _count: { select: { users: true } } } });
  await writeAudit(session.email, "role.updated", "admin-role", id, { slug: role.slug });
  return NextResponse.json({ role });
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/admin/roles/[id]">) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "roles.manage")) return forbidden();
  const { id } = await context.params;
  const role = await prisma.adminRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: "System roles cannot be deleted." }, { status: 409 });
  if (role._count.users) return NextResponse.json({ error: "Reassign this role's users before deleting it." }, { status: 409 });
  await prisma.adminRole.delete({ where: { id } });
  await writeAudit(session.email, "role.deleted", "admin-role", id, { slug: role.slug });
  return NextResponse.json({ ok: true });
}
