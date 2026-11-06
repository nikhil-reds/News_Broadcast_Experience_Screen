"use client";

import { abroSans } from "@/lib/abro-sans";
import { poppins } from "@/lib/poppins";
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
    <div className={`${poppins.className} ${abroSans.variable} admin-theme admin-theme-${theme} relative min-h-dvh bg-admin-page text-admin-text`}>
      <div aria-hidden="true" className="mesh-bg mesh-grid pointer-events-none fixed inset-0 z-0" />
      <div className="relative z-10 flex min-h-dvh">
        <AdminSidebar email={email} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <div className="min-h-dvh min-w-0 flex-1">
          <AdminNavbar sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen((open) => !open)} />
          <main className="admin-content min-h-[calc(100dvh-4rem)] w-full min-w-0 p-4 sm:p-5 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
