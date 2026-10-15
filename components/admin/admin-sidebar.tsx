"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { adminNavigation } from "@/lib/admin-navigation";

type AdminSidebarProps = { email: string; open: boolean; onClose: () => void };

const icons: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  studio: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4M8 10h.01M12 10h.01M16 10h.01" />
    </>
  ),
  "control-room": (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M7 21h10M12 17v4M7 8h.01M12 8h.01M17 8h.01M7 12h.01M12 12h.01M17 12h.01" />
    </>
  ),
  sessions: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  screens: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  recordings: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </>
  ),
  audio: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  transcripts: <path d="M4 6h16M4 12h10M4 18h7" />,
  translations: (
    <>
      <path d="M5 8h8M9 5v3M7 8c.8 3 3 5 6 6" />
      <path d="M13 19l3-8 3 8M14 16h4" />
    </>
  ),
  ads: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4z" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9" />
    </>
  ),
  workers: (
    <>
      <rect x="4" y="4" width="16" height="6" rx="1" />
      <rect x="4" y="14" width="16" height="6" rx="1" />
      <path d="M8 7h.01M8 17h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
};

function isActivePath(pathname: string, href: string) {
  // "/admin" is the dashboard, so only match it exactly; otherwise "/admin" would stay active everywhere.
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ email, open, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside id="admin-navigation" aria-label="Admin navigation panel" className={`admin-sidebar-gradient fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,88vw)] shrink-0 flex-col border-r border-white/10 text-white shadow-2xl transition-transform duration-200 motion-reduce:transition-none md:w-[4.5rem] lg:sticky lg:z-auto lg:h-screen lg:w-64 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 pb-3 pt-3 md:justify-center md:px-3 lg:justify-start lg:px-5">
        <div className="min-w-0 md:hidden lg:block">
          <span className="block truncate text-lg font-bold leading-7 tracking-tight text-white">News Simulation</span>
          <span className="block truncate text-xs leading-4 text-slate-400">Smarter broadcast experience</span>
        </div>
        <span className="hidden text-xl font-bold leading-8 text-white md:block lg:hidden" aria-hidden="true">N</span>
        <button type="button" onClick={onClose} aria-label="Close navigation" className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white md:hidden">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {adminNavigation.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              title={item.label}
              className={`group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition md:justify-center md:px-2 lg:justify-start lg:px-3 ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {icons[item.icon]}
              </svg>
              <span className="md:hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-white/10 p-3">
        <p className="hidden truncate px-1 text-xs text-slate-400 lg:block" title={email}>
          Signed in as <span className="font-medium text-slate-200">{email}</span>
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 lg:px-3"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5M21 12H9" />
            </svg>
            <span className="md:hidden lg:inline">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
