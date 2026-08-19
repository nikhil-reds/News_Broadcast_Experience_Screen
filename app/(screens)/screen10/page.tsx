"use client";

import React, { useState, useEffect, useCallback } from "react";

interface AdCampaign {
  id?: string;
  sponsor: string;
  text: string;
  code: string;
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
const PLACEHOLDER_VIDEO = "/vecteezy_young-businesswoman-thinking-while-working-on-the-computer_31759070.mp4";

export default function Screen10Page() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(FALLBACK_CAMPAIGNS);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [time, setTime] = useState("");
  const [reelUrl, setReelUrl] = useState<string | null>(null);

  // Screen 06's Gemini-cut highlight reel, banner-overlaid here for broadcast —
  // same source as Screen 09, so both mirrors show the same footage.
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const list: { url: string }[] = data.recordings || [];
        if (list.length > 0 && !cancelled) setReelUrl(list[0].url);
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
    // Clock
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    }, 1000);

    // Rotate active ad
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => (campaigns.length ? (prev + 1) % campaigns.length : 0));
    }, ROTATE_MS);

    return () => {
      clearInterval(timer);
      clearInterval(adTimer);
    };
  }, [campaigns]);

  useEffect(() => {
    if (currentAdIndex >= campaigns.length) setCurrentAdIndex(0);
  }, [campaigns, currentAdIndex]);

  const activeAd = campaigns[currentAdIndex] ?? campaigns[0];
  if (!activeAd) return null;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-bold tracking-wider font-mono">
              Screen 10
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-mono tracking-wider">MIRROR STREAM</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Ads Banner Mirror</h1>
          <p className="text-slate-400 text-xs">
            Secondary/mirror layout showing ads integration status for different screen layouts.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-cyan-400 tracking-wider">
            {time || "00:00:00"}
          </div>
          <span className="text-[9px] text-slate-500 font-mono">UTC MONITOR CLOCK</span>
        </div>
      </div>

      <div className="w-full space-y-6">
        {/* Main Video Section with Bottom Ad Overlay */}
        <div className="w-full space-y-6">
          <div className="relative aspect-[16/9] w-full max-w-6xl mx-auto rounded-2xl bg-slate-900 border border-slate-800/80 overflow-hidden shadow-2xl group">
            {/* Ambient Scanlines */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.15)_95%)] bg-[size:100%_4px] opacity-20 pointer-events-none z-10" />

            {/* Corner Bracket UI indicators */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />

            {/* Video Feed — Screen 06's highlight reel once one exists */}
            <video
              key={reelUrl || PLACEHOLDER_VIDEO}
              src={reelUrl || PLACEHOLDER_VIDEO}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Ad Banner Overlay (Bottom of Video) */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-950/85 backdrop-blur-md border border-indigo-500/30 rounded-xl p-3.5 flex items-center justify-between shadow-lg z-20 transition-all duration-500">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 text-white text-[9px] font-mono font-extrabold px-2.5 py-1 rounded tracking-widest animate-pulse border border-indigo-400/30">
                  SPONSOR
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-300 tracking-wide font-mono">
                    {activeAd.sponsor}
                  </h4>
                  <p className="text-[11px] text-slate-200 line-clamp-1 mt-0.5">
                    {activeAd.text}
                  </p>
                </div>
              </div>
              <div className="hidden sm:block text-right">
                <div className="text-[9px] text-slate-400 font-mono tracking-wider">CAMPAIGN CODE</div>
                <div className="text-[10px] text-indigo-400 font-mono font-bold">{activeAd.code}</div>
              </div>
            </div>

            {/* Top Video Status Overlays */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    reelUrl ? "bg-indigo-500 animate-ping" : "bg-slate-600"
                  }`}
                />
                {reelUrl ? "HIGHLIGHT REEL" : "AWAITING REEL"}
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                1080p @ 60FPS
              </div>
            </div>
          </div>

          {/* Campaign Pool (Below Video - Horizontal Grid of all three) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
            {campaigns.map((camp, idx) => {
              const isActive = idx === currentAdIndex;
              return (
                <div 
                  key={camp.code}
                  className={`h-64 rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all duration-500 border ${
                    isActive 
                      ? "bg-slate-900 border-indigo-500/60 shadow-indigo-950/40" 
                      : "bg-slate-900/40 border-slate-800/60 opacity-60"
                  }`}
                >
                  {/* Background glow for active */}
                  {isActive && (
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl animate-pulse" />
                  )}
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-wider ${
                        isActive 
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" 
                          : "bg-slate-950 text-slate-500 border border-slate-800"
                      }`}>
                        {isActive ? "Active Campaign" : "Queued"}
                      </span>
                      {isActive && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h3 className={`text-sm font-extrabold tracking-wide font-mono ${isActive ? "text-white" : "text-slate-300"}`}>
                        {camp.sponsor}
                      </h3>
                      <p className={`text-xs leading-relaxed font-sans ${isActive ? "text-slate-200" : "text-slate-400"}`}>
                        {camp.text}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                    <div>
                      <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider">Campaign Code</div>
                      <div className={`text-xs font-bold font-mono ${isActive ? "text-indigo-400" : "text-slate-500"}`}>{camp.code}</div>
                    </div>
                    <div className="text-xl">{idx === 0 ? "🎨" : idx === 1 ? "💻" : "⚙️"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
