"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className={`admin-theme admin-theme-${theme} min-h-screen bg-admin-page text-admin-text`}>
      <div className="flex min-h-screen">
        <AdminSidebar email={email} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <AdminNavbar theme={theme} sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen((open) => !open)} />
          <main className="mx-auto w-full max-w-[1664px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
