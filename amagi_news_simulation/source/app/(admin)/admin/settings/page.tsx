import { SettingsWorkspace } from "@/components/admin/settings/settings-workspace";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/session";
import { ensureSystemRoles } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function AdminSettingsPage() {
  const session = await getAdminSession();
  if (!session?.permissions.includes("settings.read")) redirect("/admin");
  await ensureSystemRoles();
  const email = (process.env.ADMIN_EMAIL ?? "admin@amagi.local").toLowerCase();
  const [databaseUsers, roles] = await Promise.all([
    session.permissions.includes("users.read") ? prisma.adminUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, role: { select: { id: true, name: true, slug: true } } } }) : Promise.resolve([]),
    session.permissions.includes("roles.read") ? prisma.adminRole.findMany({ include: { _count: { select: { users: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }) : Promise.resolve([]),
  ]);
  const users = [
    { id: "environment-admin", name: email.split("@")[0].replace(/[._-]/g, " "), email, status: "active", source: "environment" as const, lastLoginAt: null, createdAt: null, role: { id: "environment-super-admin", name: "Super Admin", slug: "super-admin" } },
    ...databaseUsers.filter((user) => user.email.toLowerCase() !== email).map((user) => ({ ...user, source: "database" as const, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString() })),
  ];
  return <SettingsWorkspace email={email} initialUsers={users} initialRoles={roles} permissions={session?.permissions ?? []} hasCustomPassword={Boolean(process.env.ADMIN_PASSWORD)} hasCustomSecret={Boolean(process.env.ADMIN_SESSION_SECRET)} />;
}
