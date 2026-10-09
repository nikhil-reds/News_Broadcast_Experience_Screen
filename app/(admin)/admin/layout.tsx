import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminTheme } from "@/lib/admin-theme";
import { verifyAdminSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await verifyAdminSession();
  const theme = await getAdminTheme();
  return (
    <AdminShell email={session.email} theme={theme}>
      {children}
    </AdminShell>
  );
}
