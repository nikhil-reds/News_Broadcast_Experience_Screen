"use client";

import React, { useState, useEffect, useRef } from "react";
import { composedOutputUrl } from "@/lib/green-screen";
import Image from "next/image";

const ADS = [
  {
    id: "amul",
    fullImage: "/ads/ads001.png"
  },
  {
    id: "ads002",
    fullImage: "/ads/ads002.png"
  },
  {
    id: "ads003",
    fullImage: "/ads/ads003.png"
  }
];

const ROTATE_MS = 10000;
const REEL_POLL_MS = 3000;

export default function Screen9Page() {
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Use the Screen 7-style composite built from the edited highlight reel.
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const list: { filename: string; url: string }[] = data.recordings || [];
        if (list.length > 0 && !cancelled) {
          setReelUrl(composedOutputUrl("newsroom-blue", list[0].filename));
        }
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

  const enableAudio = () => {
    videoRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  };

  useEffect(() => {
    // Rotate the ad creative
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % ADS.length);
    }, ROTATE_MS);

    return () => clearInterval(adTimer);
  }, []);

  const activeAd = ADS[currentAdIndex];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-sans text-slate-100">
      
      {/* LAYER 1: Full 16:9 Generated L-Band Image Background */}
      <div className="absolute inset-0 z-0">
        <Image
          src={activeAd.fullImage}
          alt={`Ad Campaign ${activeAd.id}`}
          fill
          className="object-cover transition-opacity duration-1000"
          priority
        />
      </div>

      {/* LAYER 2: Live Video Window overlaying the "fake" generated program area */}
      {/* Adjust w-[75%] h-[80%] right-0 top-0 to fit exactly over the generated program area */}
      <section 
        className="absolute top-0 right-0 w-[81%] h-[76%] z-10 overflow-hidden bg-black shadow-[-10px_10px_30px_rgba(0,0,0,0.5)] border-l border-b border-white/10" 
        onClick={enableAudio}
      >
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.15)_95%)] bg-[size:100%_4px] opacity-20" />

        <div className="pointer-events-none absolute left-4 top-4 z-10 h-4 w-4 border-l-2 border-t-2 border-slate-500/40" />
        <div className="pointer-events-none absolute right-4 top-4 z-10 h-4 w-4 border-r-2 border-t-2 border-slate-500/40" />
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 h-4 w-4 border-b-2 border-l-2 border-slate-500/40" />
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 h-4 w-4 border-b-2 border-r-2 border-slate-500/40" />

        {reelUrl ? (
          <video
            key={reelUrl}
            ref={videoRef}
            src={reelUrl}
            autoPlay
            loop
            playsInline
            onLoadedData={() => {
              videoRef.current
                ?.play()
                .then(() => setSoundBlocked(false))
                .catch(() => setSoundBlocked(true));
            }}
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
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${reelUrl ? "bg-indigo-500 animate-ping" : "bg-slate-600"}`} />
            {reelUrl ? "LIVE BROADCAST" : "AWAITING FEED"}
          </div>
        </div>
        {soundBlocked && (
          <div className="absolute bottom-6 right-6 z-20 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs font-mono text-slate-200">
            🔊 Click video to enable synchronized audio
          </div>
        )}
      </section>

    </div>
  );
}
