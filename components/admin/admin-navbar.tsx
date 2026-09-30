import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { adminNavigation } from "@/lib/admin-navigation";

export function AdminNavbar({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Control Center</p>
          <h1 className="text-lg font-bold text-slate-950">News Broadcast Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
          >
            Open Studio
          </Link>
          <form action={signOutAction}>
            <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
        {adminNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-6">
        Signed in as {email}
      </div>
    </header>
  );
}
