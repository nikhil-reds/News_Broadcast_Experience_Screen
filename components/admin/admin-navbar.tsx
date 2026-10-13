import Link from "next/link";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import type { AdminTheme } from "@/lib/admin-theme";

export function AdminNavbar({ theme, sidebarOpen, onMenuClick }: { theme: AdminTheme; sidebarOpen: boolean; onMenuClick: () => void }) {
  return (
    <header className="admin-navbar sticky top-0 z-30 border-b border-admin-border bg-admin-surface/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onMenuClick} aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} aria-controls="admin-navigation" className="inline-flex size-11 items-center justify-center rounded-md border border-admin-border text-admin-text-secondary hover:bg-admin-surface-muted focus-visible:outline-2 focus-visible:outline-admin-focus lg:hidden">
            <span aria-hidden="true" className="text-xl">{sidebarOpen ? "×" : "☰"}</span>
          </button>
          <span className="truncate text-sm font-semibold text-admin-text lg:hidden">Admin control center</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
        <AdminThemeToggle theme={theme} />
        <Link
          href="/admin/control-room"
          className="inline-flex rounded-md border border-admin-border px-3 py-2 text-sm font-semibold text-admin-text-secondary hover:bg-admin-surface-muted sm:px-3"
        >
          <span className="hidden sm:inline">Open Studio</span><span className="sm:hidden" aria-hidden="true">Studio</span>
        </Link>
        </div>
      </div>
    </header>
  );
}
