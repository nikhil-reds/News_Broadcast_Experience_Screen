import "server-only";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/admin-users";

export async function verifyAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/signin");
  }
  return session;
}

export async function validateAdminCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@amagi.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === adminEmail.toLowerCase() && password === adminPassword) return { email: normalizedEmail, userId: null };
  const user = await prisma.adminUser.findUnique({ where: { email: normalizedEmail }, include: { role: true } });
  if (!user || !user.role || user.status !== "active" || !await verifyPassword(password, user.passwordHash)) return null;
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { email: user.email, userId: user.id };
}
