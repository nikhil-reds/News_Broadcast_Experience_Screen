"use client";

import React, { useState, useEffect } from "react";

const AD_CAMPAIGNS = [
  { sponsor: "AMAGI CLOUDPORT", text: "Scale your broadcast channel playout and platform delivery dynamically in the cloud.", code: "AMAGI-PLAYOUT" },
  { sponsor: "AMAGI THUNDERSTORM", text: "Supercharge your CTV & FAST monetization with advanced Server-Side Ad Insertion (SSAI).", code: "AMAGI-DYNAMIC-ADS" },
  { sponsor: "AMAGI PLANNER", text: "Simplify scheduling, planning, and EPG management for broadcast and FAST networks.", code: "AMAGI-EPG-PLANNER" },
];

export default function Screen10Page() {
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [time, setTime] = useState("");

  useEffect(() => {
    // Clock
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    }, 1000);

    // Rotate active ad
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % AD_CAMPAIGNS.length);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(adTimer);
    };
  }, []);

  const activeAd = AD_CAMPAIGNS[currentAdIndex];

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
        {/* Main Video Section with Left Vertical Ad Overlay */}
        <div className="w-full space-y-6">
          <div className="relative aspect-[16/9] w-full max-w-6xl mx-auto rounded-2xl bg-slate-900 border border-slate-800/80 overflow-hidden shadow-2xl group">
            {/* Ambient Scanlines */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.15)_95%)] bg-[size:100%_4px] opacity-20 pointer-events-none z-10" />

            {/* Corner Bracket UI indicators */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-500/40 pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-500/40 pointer-events-none z-10" />

            {/* Video Feed */}
            <video
              src="/vecteezy_young-businesswoman-thinking-while-working-on-the-computer_31759070.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Ad Banner Overlay (Vertical Left Side ON the Video) */}
            <div className="absolute left-6 top-16 bottom-16 w-64 bg-slate-950/85 backdrop-blur-md border border-indigo-500/30 rounded-xl p-5 flex flex-col justify-between shadow-2xl z-20 transition-all duration-500">
              <div className="space-y-4">
                <div className="bg-indigo-600 text-white text-[9px] font-mono font-extrabold px-2.5 py-1 rounded tracking-widest animate-pulse border border-indigo-400/30 self-start w-fit">
                  SPONSOR
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-indigo-300 tracking-wide font-mono">
                    {activeAd.sponsor}
                  </h4>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {activeAd.text}
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-800/80 pt-3">
                <div className="text-[8px] text-slate-400 font-mono tracking-wider uppercase">CAMPAIGN CODE</div>
                <div className="text-xs text-indigo-400 font-mono font-bold mt-0.5">{activeAd.code}</div>
              </div>
            </div>

            {/* Top Video Status Overlays */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                HDMI-OUT-10
              </div>
              <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-300">
                1080p @ 60FPS
              </div>
            </div>
          </div>

          {/* Campaign Pool (Below Video - Horizontal Grid of all three) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
            {AD_CAMPAIGNS.map((camp, idx) => {
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
