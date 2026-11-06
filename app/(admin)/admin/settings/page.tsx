import { SettingsWorkspace } from "@/components/admin/settings/settings-workspace";
import { prisma } from "@/lib/prisma";

export default async function AdminSettingsPage() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@amagi.local").toLowerCase();
  const databaseUsers = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true } });
  const users = [
    { id: "environment-admin", name: email.split("@")[0].replace(/[._-]/g, " "), email, status: "active", source: "environment" as const, lastLoginAt: null, createdAt: null },
    ...databaseUsers.filter((user) => user.email.toLowerCase() !== email).map((user) => ({ ...user, source: "database" as const, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString() })),
  ];
  return <SettingsWorkspace email={email} initialUsers={users} hasCustomPassword={Boolean(process.env.ADMIN_PASSWORD)} hasCustomSecret={Boolean(process.env.ADMIN_SESSION_SECRET)} />;
}
