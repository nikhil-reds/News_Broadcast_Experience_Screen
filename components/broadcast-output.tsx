"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Screen11HighlightPlayer, { type BroadcastDisplayProfile } from "./screen11-highlight-player";

const DISPLAY_PROFILES: Record<string, BroadcastDisplayProfile> = {
  "/broadcast01": "portrait-mobile",
  "/broadcast02": "landscape-mobile",
  "/broadcast03": "portrait-tablet",
  "/broadcast04": "landscape-tablet",
  "/broadcast05": "landscape-tablet",
  "/broadcast06": "tv",
};

export default function BroadcastOutput() {
  const pathname = usePathname();
  const soundEnabled = pathname === "/broadcast05";
  const displayProfile = DISPLAY_PROFILES[pathname] ?? "tv";
  const [feed, setFeed] = useState<{ sessionId: string; publishedAt: number; startedAt: number } | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: number;
    async function refresh() {
      try {
        const sent = Date.now();
        const response = await fetch("/api/screen-workflow?screen=12&output=1", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error();
        const state = await response.json();
        const offset = (sent + Date.now()) / 2 - state.serverNow;
        if (!disposed) setFeed(previous => state.startedAt == null ? null :
          previous && previous.sessionId === state.sessionId && previous.publishedAt === state.startedAt ? previous : { sessionId: state.sessionId, publishedAt: state.startedAt, startedAt: state.startedAt + offset });
      } catch { /* Keep playing during a temporary connection loss. */ }
      if (!disposed) timer = window.setTimeout(refresh, 500);
    }
    void refresh();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, []);
  return feed ? <Screen11HighlightPlayer key={feed.sessionId} {...feed} soundEnabled={soundEnabled} displayProfile={displayProfile} /> :
    <main className="grid h-screen place-items-center bg-black">
      <img src="/amagi-logo-white.svg" alt="Amagi" className="w-64 max-w-[60vw]" />
    </main>;
}
