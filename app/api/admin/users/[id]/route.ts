import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { canAssignRole, forbidden, hasPermission, writeAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/users/[id]">) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "users.update")) return forbidden();
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { roleId?: unknown; status?: unknown } | null;
  const user = await prisma.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.role?.permissions.includes("roles.manage") && !hasPermission(session.permissions, "roles.manage")) return forbidden();
  if (body?.status !== undefined && !hasPermission(session.permissions, "users.disable")) return forbidden();
  if (session.userId === id && body?.status === "disabled") return NextResponse.json({ error: "You cannot disable your own account." }, { status: 409 });
  let roleId: string | undefined;
  if (body?.roleId !== undefined) {
    if (typeof body.roleId !== "string") return NextResponse.json({ error: "Select a valid role." }, { status: 400 });
    const role = await prisma.adminRole.findUnique({ where: { id: body.roleId } });
    if (!role) return NextResponse.json({ error: "Select a valid role." }, { status: 400 });
    if (!canAssignRole(session.permissions, role.permissions)) return forbidden();
    roleId = role.id;
  }
  const status = body?.status === undefined ? undefined : body.status === "active" || body.status === "disabled" ? body.status : null;
  if (status === null) return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
  const updated = await prisma.adminUser.update({ where: { id }, data: { roleId, status }, select: { id: true, status: true, role: { select: { id: true, name: true, slug: true } } } });
  await writeAudit(session.email, "user.updated", "admin-user", id, { role: updated.role?.slug ?? null, status: updated.status });
  return NextResponse.json({ user: updated });
}
