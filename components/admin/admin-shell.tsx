import type { ReactNode } from "react";
import { AdminNavbar } from "@/components/admin/admin-navbar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import type { AdminTheme } from "@/lib/admin-theme";

export function AdminShell({
  children,
  email,
  theme,
}: {
  children: ReactNode;
  email: string;
  theme: AdminTheme;
}) {
  return (
    <div className={`admin-theme admin-theme-${theme} min-h-screen bg-admin-page text-admin-text`}>
      <div className="flex min-h-screen">
        <AdminSidebar email={email} />
        <div className="min-w-0 flex-1">
          <AdminNavbar theme={theme} />
          <main className="mx-auto w-full max-w-[1664px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
