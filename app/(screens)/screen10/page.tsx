"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { composedOutputUrl } from "@/lib/green-screen";

interface AdCampaign {
  id?: string;
  sponsor: string;
  text: string;
  code: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

/**
 * Screen 10 mirrors Screen 09's rotation exactly (same campaigns, same
 * clock) so the two HDMI outputs never show conflicting sponsors — it just
 * renders the bottom-banner layout instead of Screen 09's left-side vertical
 * banner.
 */
const FALLBACK_CAMPAIGNS: AdCampaign[] = [
  { sponsor: "AMAGI CLOUDPORT", text: "Scale your broadcast channel playout and platform delivery dynamically in the cloud.", code: "AMAGI-PLAYOUT" },
  { sponsor: "AMAGI THUNDERSTORM", text: "Supercharge your CTV & FAST monetization with advanced Server-Side Ad Insertion (SSAI).", code: "AMAGI-DYNAMIC-ADS" },
  { sponsor: "AMAGI PLANNER", text: "Simplify scheduling, planning, and EPG management for broadcast and FAST networks.", code: "AMAGI-EPG-PLANNER" },
];

const ROTATE_MS = 5000;
const REFETCH_MS = 30000;
const REEL_POLL_MS = 3000;

export default function Screen10Page() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(FALLBACK_CAMPAIGNS);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fixed Screen 7-style green-screen composite — the same source as Screen 09.
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const list: { filename: string }[] = data.recordings || [];
        if (list.length > 0 && !cancelled) setReelUrl(composedOutputUrl("newsroom-blue", list[0].filename));
      } catch {
        // Keep whatever reel is already on screen.
      }
    };
    fetchLatestReel();
    const interval = setInterval(fetchLatestReel, REEL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fetchOriginalAudio = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const original = (data.audioFiles as AudioFileItem[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (original) setOriginalAudioUrl(original.url);
      } catch {
        // The video remains playable while the original audio source retries on reload.
      }
    };
    fetchOriginalAudio();
  }, []);

  useEffect(() => {
    if (!originalAudioUrl || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  }, [originalAudioUrl]);

  const enableAudio = () => {
    audioRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  };

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-campaigns");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        setCampaigns(data.campaigns);
      } else {
        setCampaigns(FALLBACK_CAMPAIGNS);
      }
    } catch {
      // Keep whatever campaigns are already on screen.
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    const refetchTimer = setInterval(fetchCampaigns, REFETCH_MS);
    return () => clearInterval(refetchTimer);
  }, [fetchCampaigns]);

  useEffect(() => {
    // Rotate active ad
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => (campaigns.length ? (prev + 1) % campaigns.length : 0));
    }, ROTATE_MS);

    return () => {
      clearInterval(adTimer);
    };
  }, [campaigns]);

  useEffect(() => {
    if (currentAdIndex >= campaigns.length) setCurrentAdIndex(0);
  }, [campaigns, currentAdIndex]);

  const activeAd = campaigns[currentAdIndex] ?? campaigns[0];
  if (!activeAd) return null;

  return (
    <div className="grid h-screen w-screen grid-rows-[90%_10%] overflow-hidden bg-slate-950 font-sans text-slate-100">
      <section className="relative min-h-0 overflow-hidden bg-slate-900 group" onClick={enableAudio}>
            {/* Ambient Scanlines */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.15)_95%)] bg-[size:100%_4px] opacity-20 pointer-events-none z-10" />

            {/* Corner Bracket UI indicators */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />

            {/* Video Feed — Screen 06's highlight reel once one exists */}
            {reelUrl ? (
              <video
                key={reelUrl}
                src={reelUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center bg-slate-950 p-10"
                role="status"
                aria-label="Loading composited video"
              >
                <div className="w-full max-w-3xl space-y-7 animate-pulse">
                  <div className="h-8 w-36 rounded-full bg-slate-800/90" />
                  <div className="h-48 rounded-2xl bg-slate-800/75" />
                  <div className="h-10 w-3/4 rounded-xl bg-slate-800/55" />
                </div>
              </div>
            )}
            <audio ref={audioRef} src={originalAudioUrl || undefined} autoPlay loop />

            {/* Top Video Status Overlays */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    reelUrl ? "bg-indigo-500 animate-ping" : "bg-slate-600"
                  }`}
                />
                {reelUrl ? "COMPOSITED FEED" : "AWAITING COMPOSITE"}
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                1080p @ 60FPS
              </div>
            </div>
            {soundBlocked && (
              <div className="absolute bottom-6 right-6 z-20 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs font-mono text-slate-200">
                🔊 Click video to enable original audio
              </div>
            )}
      </section>

      <aside className="flex min-h-0 items-center justify-between gap-8 border-t border-indigo-500/25 bg-slate-900 px-8 py-6 shadow-2xl shadow-black/30">
        <div className="flex min-w-0 items-center gap-5">
          <span className="shrink-0 rounded border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-[10px] font-mono font-extrabold tracking-widest text-indigo-200">
            ACTIVE CAMPAIGN
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl font-extrabold tracking-wide text-indigo-200">
              {activeAd.sponsor}
            </h1>
            <p className="mt-1 truncate text-sm text-slate-300">{activeAd.text}</p>
          </div>
        </div>
        <div className="shrink-0 border-l border-slate-700/80 pl-8 text-right">
          <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Campaign code</p>
          <p className="mt-1 font-mono text-sm font-bold text-indigo-400">{activeAd.code}</p>
        </div>
      </aside>
    </div>
  );
}
