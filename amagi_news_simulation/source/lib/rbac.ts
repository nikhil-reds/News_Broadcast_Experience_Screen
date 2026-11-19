import "server-only";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLES } from "@/lib/rbac-policy";
export { canAssignRole, hasPermission, PERMISSIONS, SYSTEM_ROLES } from "@/lib/rbac-policy";
export type { Permission } from "@/lib/rbac-policy";

export async function ensureSystemRoles() {
  const roles = await Promise.all(SYSTEM_ROLES.map((role) => prisma.adminRole.upsert({
    where: { slug: role.slug },
    update: { name: role.name, description: role.description, permissions: role.permissions, isSystem: true },
    create: { ...role, isSystem: true },
  })));
  const admin = roles.find((role) => role.slug === "admin")!;
  await prisma.adminUser.updateMany({ where: { roleId: null }, data: { roleId: admin.id } });
  return roles;
}

export function forbidden() {
  return NextResponse.json({ error: "You do not have permission to perform this action." }, { status: 403 });
}

export async function writeAudit(actorEmail: string, action: string, targetType: string, targetId?: string, metadata?: Record<string, string | boolean | null>) {
  await prisma.adminAuditLog.create({ data: { actorEmail, action, targetType, targetId, metadata } });
}
