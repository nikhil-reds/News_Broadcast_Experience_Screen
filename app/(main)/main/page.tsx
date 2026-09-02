"use client";

import React, { useState, useEffect } from "react";
import { composedOutputUrl } from "@/lib/green-screen";

interface DeviceConfig {
  name: string;
  res: string;
  ratio: string;
  usage: string;
  aspectClass: string;
  deviceStyle: string;
  containerStyle: string;
  cardTheme: string;
}

const DEVICES: DeviceConfig[] = [
  {
    name: "Mobile (Small)",
    res: "720 × 1280",
    ratio: "9:16",
    usage: "Budget Android phones",
    aspectClass: "aspect-[9/16]",
    deviceStyle: "border-4 border-slate-800 rounded-2xl",
    containerStyle: "w-full max-w-[114px] mx-auto",
    cardTheme: "border-blue-500/30 shadow-blue-950/20 group-hover:border-blue-400/60",
  },
  {
    name: "Mobile (Standard)",
    res: "1080 × 1920",
    ratio: "9:16",
    usage: "Most Android phones",
    aspectClass: "aspect-[9/16]",
    deviceStyle: "border-4 border-slate-800 rounded-2xl",
    containerStyle: "w-full max-w-[126px] mx-auto",
    cardTheme: "border-blue-500/30 shadow-blue-950/20 group-hover:border-blue-400/60",
  },
  {
    name: "Mobile (High-end)",
    res: "1440 × 2560",
    ratio: "9:16",
    usage: "Premium Android phones",
    aspectClass: "aspect-[9/16]",
    deviceStyle: "border-4 border-slate-800 rounded-2xl",
    containerStyle: "w-full max-w-[138px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "iPhone Modern",
    res: "1179 × 2556",
    ratio: "~19.5:9",
    usage: "iPhone 15/16",
    aspectClass: "aspect-[1179/2556]",
    deviceStyle: "border-[6px] border-slate-800 rounded-[32px] relative",
    containerStyle: "w-full max-w-[120px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "Tablet (8–10\")",
    res: "1200 × 1920",
    ratio: "10:16",
    usage: "Android tablets",
    aspectClass: "aspect-[10/16]",
    deviceStyle: "border-[6px] border-slate-800 rounded-2xl",
    containerStyle: "w-full max-w-[138px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "iPad",
    res: "2048 × 2732",
    ratio: "3:4",
    usage: "iPad Pro",
    aspectClass: "aspect-[3/4]",
    deviceStyle: "border-[8px] border-slate-800 rounded-2xl",
    containerStyle: "w-full max-w-[156px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "Laptop HD",
    res: "1366 × 768",
    ratio: "16:9",
    usage: "Older laptops",
    aspectClass: "aspect-[16/9]",
    deviceStyle: "border-[6px] border-slate-800 border-b-[12px] rounded-t-xl",
    containerStyle: "w-full max-w-[204px] mx-auto",
    cardTheme: "border-amber-500/30 shadow-amber-950/20 group-hover:border-amber-400/60",
  },
  {
    name: "Laptop / Monitor Full HD",
    res: "1920 × 1080",
    ratio: "16:9",
    usage: "Most laptops & monitors",
    aspectClass: "aspect-[16/9]",
    deviceStyle: "border-[6px] border-slate-800 border-b-[12px] rounded-t-xl",
    containerStyle: "w-full max-w-[210px] mx-auto",
    cardTheme: "border-amber-500/30 shadow-amber-950/20 group-hover:border-amber-400/60",
  },
  {
    name: "Monitor QHD",
    res: "2560 × 1440",
    ratio: "16:9",
    usage: "Professional monitors",
    aspectClass: "aspect-[16/9]",
    deviceStyle: "border-4 border-slate-800 rounded-lg",
    containerStyle: "w-full max-w-[222px] mx-auto",
    cardTheme: "border-amber-500/30 shadow-amber-950/20 group-hover:border-amber-400/60",
  },
  {
    name: "Monitor 4K / TV",
    res: "3840 × 2160",
    ratio: "16:9",
    usage: "4K TVs & monitors",
    aspectClass: "aspect-[16/9]",
    deviceStyle: "border-[6px] border-slate-800 rounded-lg",
    containerStyle: "w-full max-w-[240px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "Ultrawide Monitor",
    res: "3440 × 1440",
    ratio: "21:9",
    usage: "Ultrawide displays",
    aspectClass: "aspect-[21/9]",
    deviceStyle: "border-4 border-slate-800 rounded-xl",
    containerStyle: "w-full max-w-[252px] mx-auto",
    cardTheme: "border-violet-500/30 shadow-violet-950/20 group-hover:border-violet-400/60",
  },
  {
    name: "Digital Signage (Portrait)",
    res: "1080 × 1920",
    ratio: "9:16",
    usage: "Kiosks, advertising displays",
    aspectClass: "aspect-[9/16]",
    deviceStyle: "border-[8px] border-slate-900 rounded-sm shadow-inner",
    containerStyle: "w-full max-w-[114px] mx-auto",
    cardTheme: "border-lime-500/40 shadow-lime-950/20 group-hover:border-lime-400/60",
  },
];

export default function MultiDevicePreviewPage() {
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);

  // Every device preview displays the same fixed green-screen composite used
  // by Screens 8–12, rather than a placeholder or raw camera footage.
  useEffect(() => {
    let cancelled = false;
    const loadComposite = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const latest = data.recordings?.[0] as { filename?: string } | undefined;
        if (latest?.filename && !cancelled) {
          setCompositeUrl(composedOutputUrl("newsroom-blue", latest.filename));
        }
      } catch {
        // Preserve the last successfully loaded preview.
      }
    };
    loadComposite();
    const timer = setInterval(loadComposite, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-8 font-sans text-slate-100 animate-fade-in">
      {/* Masonry / Random Collage layout matching the drawing */}
      <div className="columns-1 sm:columns-2 md:columns-3 xl:columns-4 gap-6 space-y-6 max-w-7xl mx-auto w-full">
        {DEVICES.map((device, index) => (
          <div 
            key={index} 
            className={`break-inside-avoid inline-block w-full bg-slate-900/40 border rounded-2xl p-5 flex flex-col items-center space-y-4 hover:shadow-2xl transition-all duration-500 shadow-xl group ${device.cardTheme}`}
          >
            {/* Header info */}
            <div className="w-full text-center space-y-1">
              <h3 className="text-sm font-extrabold text-white tracking-wide font-mono group-hover:text-indigo-300 transition-colors">
                {index + 1}. {device.name}
              </h3>
              <div className="flex justify-center items-center gap-2 text-[10px] font-mono text-slate-400">
                <span>{device.res}</span>
                <span className="text-slate-600">•</span>
                <span className="text-indigo-400">{device.ratio}</span>
              </div>
              <p className="text-[10px] text-slate-500 italic max-w-[240px] mx-auto truncate">
                {device.usage}
              </p>
            </div>

            {/* Device player frame */}
            <div className={`${device.containerStyle} flex justify-center`}>
              <div className={`w-full overflow-hidden bg-slate-950 shadow-2xl relative transition-transform duration-500 group-hover:scale-[1.03] ${device.aspectClass} ${device.deviceStyle}`}>
                {/* Specific Notches / Speakers */}
                {device.name === "iPhone Modern" && (
                  <div className="absolute top-2.5 left-1/2 transform -translate-x-1/2 w-12 h-3.5 bg-slate-950 rounded-full z-20 flex items-center justify-center border border-slate-800/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                  </div>
                )}
                
                {compositeUrl ? (
                  <video
                    key={compositeUrl}
                    src={compositeUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    aria-label="Composited background preview"
                  />
                ) : (
                  <div className="h-full w-full animate-pulse bg-slate-900/70" aria-label="Loading composited preview" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
