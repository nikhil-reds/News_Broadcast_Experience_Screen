import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { verifyAdminSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await verifyAdminSession();
  return <AdminShell email={session.email}>{children}</AdminShell>;
}
