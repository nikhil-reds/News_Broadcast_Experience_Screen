import Link from "next/link";
import { adminNavigation } from "@/lib/admin-navigation";

export function AdminSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div>
          <p className="text-sm font-bold">Amagi Admin</p>
          <p className="text-xs text-slate-400">Broadcast operations</p>
        </div>
      </div>
      <nav className="space-y-1 px-3 py-4">
        {adminNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
