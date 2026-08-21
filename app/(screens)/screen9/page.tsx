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

/** Shown only if /api/ad-campaigns has no campaigns scheduled right now. */
const FALLBACK_CAMPAIGNS: AdCampaign[] = [
  { sponsor: "AMAGI CLOUDPORT", text: "Scale your broadcast channel playout and platform delivery dynamically in the cloud.", code: "AMAGI-PLAYOUT" },
  { sponsor: "AMAGI THUNDERSTORM", text: "Supercharge your CTV & FAST monetization with advanced Server-Side Ad Insertion (SSAI).", code: "AMAGI-DYNAMIC-ADS" },
  { sponsor: "AMAGI PLANNER", text: "Simplify scheduling, planning, and EPG management for broadcast and FAST networks.", code: "AMAGI-EPG-PLANNER" },
];

const ROTATE_MS = 5000;
const REFETCH_MS = 30000;
const REEL_POLL_MS = 3000;

export default function Screen9Page() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(FALLBACK_CAMPAIGNS);
  const [usingFallback, setUsingFallback] = useState(true);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fixed Screen 7-style green-screen composite, bannered here for broadcast.
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?camera=1");
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
        setUsingFallback(false);
      } else {
        setCampaigns(FALLBACK_CAMPAIGNS);
        setUsingFallback(true);
      }
    } catch {
      // Keep whatever campaigns are already on screen.
    }
  }, []);

  const recordImpression = useCallback(
    (campaign: AdCampaign) => {
      if (usingFallback || !campaign.code) return;
      fetch("/api/ad-campaigns/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: campaign.code }),
      }).catch(() => {});
    },
    [usingFallback]
  );

  useEffect(() => {
    fetchCampaigns();
    const refetchTimer = setInterval(fetchCampaigns, REFETCH_MS);
    return () => clearInterval(refetchTimer);
  }, [fetchCampaigns]);

  useEffect(() => {
    // Rotate the sponsor overlay.
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => {
        if (campaigns.length === 0) return prev;
        const next = (prev + 1) % campaigns.length;
        const campaign = campaigns[next];
        recordImpression(campaign);
        return next;
      });
    }, ROTATE_MS);

    return () => {
      clearInterval(adTimer);
    };
  }, [campaigns, recordImpression]);

  // Campaign list can change size on refetch — keep the index in range.
  useEffect(() => {
    if (currentAdIndex >= campaigns.length) setCurrentAdIndex(0);
  }, [campaigns, currentAdIndex]);

  const activeAd = campaigns[currentAdIndex] ?? campaigns[0];
  if (!activeAd) return null;

  return (
    <div className="grid h-screen w-screen grid-cols-[20%_80%] overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <aside className="flex min-w-0 flex-col border-r border-indigo-500/25 bg-slate-900 px-6 py-8 shadow-2xl shadow-black/30">
        <div className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.2em] text-indigo-300">
          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          SPONSORED
        </div>

        <div className="my-auto space-y-5">
          <span className="inline-flex rounded border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[9px] font-mono font-extrabold tracking-widest text-indigo-200">
            ACTIVE CAMPAIGN
          </span>
          <div className="space-y-3">
            <h1 className="break-words font-mono text-xl font-extrabold tracking-wide text-indigo-200">
              {activeAd.sponsor}
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">{activeAd.text}</p>
          </div>
        </div>

        <div className="border-t border-slate-700/80 pt-4">
          <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Campaign code</p>
          <p className="mt-1 font-mono text-sm font-bold text-indigo-400">{activeAd.code}</p>
        </div>
      </aside>

      <section className="relative min-w-0 overflow-hidden bg-black" onClick={enableAudio}>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.15)_95%)] bg-[size:100%_4px] opacity-20" />

        <div className="pointer-events-none absolute left-4 top-4 z-10 h-4 w-4 border-l-2 border-t-2 border-slate-500/40" />
        <div className="pointer-events-none absolute right-4 top-4 z-10 h-4 w-4 border-r-2 border-t-2 border-slate-500/40" />
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 h-4 w-4 border-b-2 border-l-2 border-slate-500/40" />
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 h-4 w-4 border-b-2 border-r-2 border-slate-500/40" />

        {reelUrl ? (
          <video
            key={reelUrl}
            src={reelUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-950 p-10" role="status" aria-label="Loading composited video">
            <div className="w-full max-w-3xl space-y-7 animate-pulse">
              <div className="h-8 w-36 rounded-full bg-slate-800/90" />
              <div className="h-48 rounded-2xl bg-slate-800/75" />
              <div className="h-10 w-3/4 rounded-xl bg-slate-800/55" />
            </div>
          </div>
        )}
        <audio ref={audioRef} src={originalAudioUrl || undefined} autoPlay loop />

        <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${reelUrl ? "bg-indigo-500 animate-ping" : "bg-slate-600"}`} />
            {reelUrl ? "COMPOSITED FEED" : "AWAITING COMPOSITE"}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
            1080p @ 60FPS
          </div>
        </div>
        {soundBlocked && (
          <div className="absolute bottom-6 right-6 z-20 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs font-mono text-slate-200">
            🔊 Click video to enable original audio
          </div>
        )}
      </section>
    </div>
  );
}
