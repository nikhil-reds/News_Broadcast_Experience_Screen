import "server-only";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";

export async function verifyAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/signin");
  }
  return session;
}

export function validateAdminCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@amagi.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  return email.trim().toLowerCase() === adminEmail.toLowerCase() && password === adminPassword;
}
