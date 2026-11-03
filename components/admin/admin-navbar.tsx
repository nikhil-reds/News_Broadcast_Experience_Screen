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
          <span className="truncate text-sm font-semibold text-admin-text sm:text-base">Amagi Media Labs · News Simulation</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
        <AdminThemeToggle theme={theme} />
        <Link
          href="/admin/studio/camera"
          className="group inline-flex h-11 items-center gap-3 rounded-full bg-white py-1 pl-5 pr-1 text-sm font-medium text-black shadow-[0_8px_28px_rgba(0,0,0,.22)] transition hover:bg-[#f0edf2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="hidden sm:inline">Open Studio</span><span className="sm:hidden">Studio</span>
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-black text-white transition-transform duration-300 group-hover:-rotate-45">
            <svg viewBox="0 0 24 24" className="size-4.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </span>
        </Link>
        </div>
      </div>
    </header>
  );
}
