"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { adminNavigation } from "@/lib/admin-navigation";
import { readDemoDeadline, readServerDemoDeadline, subscribeToDemoDeadline, writeDemoDeadline } from "@/lib/demo-timer";
import type { DemoState } from "@/lib/saved-demo-control";

type AdminSidebarProps = { email: string; permissions: string[]; open: boolean; onClose: () => void };

const DEMO_DURATION_SECONDS = 15 * 60;

function formatDemoTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

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
  feedback: (
    <>
      <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-1-1.73V6a2 2 0 0 1 2-2Z" />
      <path d="M8 8h8M8 12h5" />
    </>
  ),
  consent: (
    <>
      <path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M8 13l2.2 2.2L15.5 10" />
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
  // The Studio landing page and its Camera Studio child are sibling nav items.
  if (href === "/admin/studio") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ email, permissions, open, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const demoEndsAt = useSyncExternalStore(subscribeToDemoDeadline, readDemoDeadline, readServerDemoDeadline);
  const [demoNow, setDemoNow] = useState(() => Date.now());
  const [demoToast, setDemoToast] = useState<string | null>(null);
  const [demoStarting, setDemoStarting] = useState(false);
  const demoStartInFlight = useRef(false);
  const demoServerRevision = useRef(-1);
  const [demoReady, setDemoReady] = useState(false);

  const syncDemoState = useCallback((state: DemoState) => {
    if (state.revision < demoServerRevision.current) return;
    demoServerRevision.current = state.revision;
    const previous = readDemoDeadline();
    const deadline = state.active && state.endsAt ? Date.parse(state.endsAt) : null;
    if (previous !== deadline) writeDemoDeadline(deadline);
    if (previous !== null && !state.active && state.stoppedReason === "timeout") {
      setDemoToast("Demo closed at 00:00 remaining. The live footage and screen progress have been restored.");
    }
    setDemoReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/demo", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("Unable to connect to Demo. Retrying…");
        const state = await response.json() as DemoState;
        if (!cancelled) syncDemoState(state);
      } catch { /* Keep the last confirmed state and retry; never claim the live flow was restored on an error. */ }
      if (!cancelled) timer = setTimeout(refresh, 1000);
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [syncDemoState]);

  useEffect(() => {
    if (demoToast === null) return;
    const timeout = window.setTimeout(() => setDemoToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [demoToast]);

  useEffect(() => {
    if (demoEndsAt === null) return;

    function updateDemoTimer() {
      setDemoNow(Date.now());
    }

    const interval = window.setInterval(updateDemoTimer, 250);
    window.addEventListener("focus", updateDemoTimer);
    document.addEventListener("visibilitychange", updateDemoTimer);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateDemoTimer);
      document.removeEventListener("visibilitychange", updateDemoTimer);
    };
  }, [demoEndsAt]);

  async function toggleDemoTimer() {
    if (demoStartInFlight.current || !demoReady) return;
    const now = Date.now();
    const currentDeadline = readDemoDeadline();
    const ending = currentDeadline !== null;
    demoStartInFlight.current = true;
    setDemoStarting(true);
    try {
      const response = await fetch("/api/admin/demo", {
        method: ending ? "DELETE" : "POST",
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.active !== "boolean") {
        throw new Error(result?.error || "Unable to change Demo. Please try again.");
      }
      setDemoNow(Date.now());
      syncDemoState(result);
      setDemoToast(ending
        ? `Demo closed at ${formatDemoTime(Math.max(0, Math.ceil((currentDeadline - now) / 1000)))} remaining. Live footage restored.`
        : "Demo started for 15 min. Saved footage loaded. Click Apply on Screen 01 to begin.");
    } catch (error) {
      setDemoToast(error instanceof Error ? error.message : "Unable to start demo. Please try again.");
    } finally {
      demoStartInFlight.current = false;
      setDemoStarting(false);
    }
  }

  const demoActive = demoEndsAt !== null;
  const demoTime = demoActive
    ? formatDemoTime(Math.max(0, Math.min(DEMO_DURATION_SECONDS, Math.ceil((demoEndsAt - demoNow) / 1000))))
    : null;

  return (
    <>
    <aside id="admin-navigation" aria-label="Admin navigation panel" className={`admin-sidebar-gradient fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,88vw)] shrink-0 flex-col border-r border-white/10 text-white shadow-2xl transition-transform duration-200 motion-reduce:transition-none md:sticky md:z-auto md:h-screen md:w-64 md:shadow-none ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 pb-3 pt-3 md:justify-start">
        <div className="min-w-0">
          <span className="admin-sidebar-title block truncate text-[1.32rem] font-bold leading-8 tracking-tight text-white">News Simulation</span>
          <span className="block truncate text-xs font-medium leading-4 text-slate-400">Smarter broadcast experience</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close navigation" className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white md:hidden">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {adminNavigation.filter((item) => permissions.includes(item.permission)).map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              title={item.label}
              className={`group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition ${
                active
                  ? "bg-white text-black shadow-sm"
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
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {permissions.includes("studio.control") ? <div className="shrink-0 px-3 pb-3">
        <button
          type="button"
          aria-label={!demoReady ? "Connecting to Demo" : demoStarting ? "Switching demo footage" : demoActive ? `End demo: ${demoTime} remaining` : "Start 15-minute demo timer"}
          title={!demoReady ? "Connecting to Demo" : demoStarting ? "Switching demo footage" : demoActive ? `End demo: ${demoTime} remaining` : "Start 15-minute demo timer"}
          onClick={toggleDemoTimer}
          disabled={demoStarting || !demoReady}
          aria-busy={demoStarting}
          className="group inline-flex h-11 w-full items-center justify-between gap-3 rounded-full bg-white py-1 pl-5 pr-1 text-sm font-medium text-black shadow-[0_8px_28px_rgba(0,0,0,.22)] transition hover:bg-[#f0edf2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="whitespace-nowrap">{!demoReady ? "Connecting…" : demoStarting ? (demoActive ? "Ending…" : "Starting…") : demoActive ? "End Demo" : "Demo"}</span>
          {demoTime !== null && (
            <span className="flex flex-col items-center text-xs font-semibold tabular-nums">
              <span role="timer" aria-label="Demo time remaining">{demoTime}</span>
            </span>
          )}
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-white transition-transform duration-300 group-hover:-rotate-45">
            <svg viewBox="0 0 24 24" className="size-4.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {demoActive ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M5 12h13M13 6l6 6-6 6" />}
            </svg>
          </span>
        </button>
      </div> : null}

      <div className="shrink-0 space-y-3 border-t border-white/10 p-3">
        <p className="truncate px-1 text-xs text-slate-400" title={email}>
          Signed in as <span className="font-medium text-slate-200">{email}</span>
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 lg:px-3"
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
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
    <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-5 right-5 z-[100] max-w-[calc(100vw-2.5rem)]">
      {demoToast && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">
          <span>{demoToast}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setDemoToast(null)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">×</button>
        </div>
      )}
    </div>
    </>
  );
}
