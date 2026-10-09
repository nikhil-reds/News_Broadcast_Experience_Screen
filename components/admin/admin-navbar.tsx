import Link from "next/link";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import type { AdminTheme } from "@/lib/admin-theme";

export function AdminNavbar({ theme }: { theme: AdminTheme }) {
  return (
    <header className="admin-navbar sticky top-0 z-30 border-b border-admin-border bg-admin-surface/95 backdrop-blur">
      <div className="flex h-16 items-center justify-end gap-3 px-4 sm:px-6">
        <AdminThemeToggle theme={theme} />
        <Link
          href="/admin/control-room"
          className="inline-flex rounded-md border border-admin-border px-3 py-2 text-sm font-semibold text-admin-text-secondary hover:bg-admin-surface-muted"
        >
          Open Studio
        </Link>
      </div>
    </header>
  );
}
