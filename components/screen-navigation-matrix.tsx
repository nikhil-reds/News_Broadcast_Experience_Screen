"use client";

import React from "react";

interface ScreenInfo {
  id: string;
  num: string;
  title: string;
  description: string;
  path: string;
  category: "Capture" | "Processing" | "Post-Prod" | "Preview";
  icon: string;
  visualType: "camera" | "waveform" | "languages" | "video" | "banner" | "portrait" | "landscape";
}

interface ScreenNavigationMatrixProps {
  camera1Recording?: boolean;
  camera2Recording?: boolean;
  audioRecording?: boolean;
}

const SCREENS: ScreenInfo[] = [
  {
    id: "screen01",
    num: "01",
    title: "Camera 01 Footage",
    description: "Primary camera feed looping capture.",
    path: "/screen1",
    category: "Capture",
    icon: "📹",
    visualType: "camera",
  },
  {
    id: "screen02",
    num: "02",
    title: "Camera 02 Feed",
    description: "Secondary camera feed looping capture.",
    path: "/screen2",
    category: "Capture",
    icon: "📹",
    visualType: "camera",
  },
  {
    id: "screen03",
    num: "03",
    title: "Camera 03 Feed",
    description: "Auxiliary camera feed loop.",
    path: "/screen3",
    category: "Capture",
    icon: "📹",
    visualType: "camera",
  },
  {
    id: "screen04",
    num: "04",
    title: "Audio in Text",
    description: "Whisper live speech-to-text transcript.",
    path: "/screen4",
    category: "Processing",
    icon: "📝",
    visualType: "waveform",
  },
  {
    id: "screen05",
    num: "05",
    title: "Multi-Language",
    description: "CosyVoice 2 audio translation ring.",
    path: "/screen5",
    category: "Processing",
    icon: "🌐",
    visualType: "languages",
  },
  {
    id: "screen06",
    num: "06",
    title: "Edited Video (1st)",
    description: "Gemini-cut initial highlight reel.",
    path: "/screen6",
    category: "Post-Prod",
    icon: "🎬",
    visualType: "video",
  },
  {
    id: "screen07",
    num: "07",
    title: "Bg Changes Video",
    description: "Video feed with modified background layouts.",
    path: "/screen7",
    category: "Post-Prod",
    icon: "🖼️",
    visualType: "video",
  },
  {
    id: "screen08",
    num: "08",
    title: "Subtitle Lang Change",
    description: "Edited highlights with dynamic subtitle languages.",
    path: "/screen8",
    category: "Post-Prod",
    icon: "🔤",
    visualType: "video",
  },
  {
    id: "screen09",
    num: "09",
    title: "Ads Banner Video",
    description: "Edited video with integrated advertisement banners.",
    path: "/screen9",
    category: "Post-Prod",
    icon: "🏷️",
    visualType: "banner",
  },
  {
    id: "screen10",
    num: "10",
    title: "Ads Banner Mirror",
    description: "Alternate layout of ads-integrated video.",
    path: "/screen10",
    category: "Post-Prod",
    icon: "🏷️",
    visualType: "banner",
  },
  {
    id: "screen11",
    num: "11",
    title: "Final Preview (Portrait)",
    description: "Mobile portrait output compilation feed.",
    path: "/screen11",
    category: "Preview",
    icon: "📱",
    visualType: "portrait",
  },
  {
    id: "screen12",
    num: "12",
    title: "Final Preview (Landscape)",
    description: "Broadcast landscape output compilation feed.",
    path: "/screen12",
    category: "Preview",
    icon: "📺",
    visualType: "landscape",
  },
];

const CATEGORY_COLORS = {
  Capture: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Processing: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Post-Prod": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  Preview: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function ScreenNavigationMatrix({
  camera1Recording = false,
  camera2Recording = false,
  audioRecording = false,
}: ScreenNavigationMatrixProps) {
  const getRecordingState = (screenNum: string) => {
    if (screenNum === "01") return camera1Recording;
    if (screenNum === "02") return camera2Recording;
    if (screenNum === "04" || screenNum === "05") return audioRecording;
    return false;
  };

  return (
    <section className="w-full bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>🖥️</span> Screen Control Room Multi-View
          </h2>
          <p className="text-xs text-slate-400">
            Monitor and redirect live output feeds across all 12 broadcast screens
          </p>
        </div>
        <div className="flex gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1 bg-rose-950/40 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Capture
          </span>
          <span className="flex items-center gap-1 bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Processing
          </span>
          <span className="flex items-center gap-1 bg-indigo-950/40 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Post-Prod
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {SCREENS.map((screen) => {
          const isRecording = getRecordingState(screen.num);

          return (
            <a
              key={screen.id}
              href={screen.path}
              className="group relative flex flex-col justify-between bg-slate-950 border border-slate-800/80 hover:border-indigo-500/50 rounded-xl p-4 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-950/30 overflow-hidden"
            >
              {/* Visual Decorative Background Ring/Grid (Monitor styling) */}
              <div className="absolute inset-0 bg-radial from-slate-950 via-slate-950 to-slate-900/50 opacity-50 z-0" />

              <div className="relative z-10 space-y-3">
                {/* Top Info row */}
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${CATEGORY_COLORS[screen.category]}`}>
                    Screen {screen.num}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {isRecording && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[9px] font-mono text-rose-300 animate-pulse">
                        ● REC
                      </span>
                    )}
                    {/* Redirect Icon */}
                    <div className="text-slate-400 group-hover:text-indigo-400 transition-colors">
                      <svg className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Simulated Screen Monitor Canvas */}
                <div className="aspect-[16/10] w-full rounded-lg bg-slate-900/60 border border-slate-800/80 overflow-hidden flex flex-col items-center justify-center p-2 relative">
                  {/* CRT Scanline effect */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_95%,rgba(0,0,0,0.3)_95%)] bg-[size:100%_4px] opacity-20 pointer-events-none" />

                  {screen.visualType === "camera" && (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5">
                      <span className="text-2xl">{screen.icon}</span>
                      <span className="text-[10px] font-mono tracking-widest text-slate-400">
                        {isRecording ? "FEED LIVE" : "CAM ON-AIR"}
                      </span>
                    </div>
                  )}

                  {screen.visualType === "waveform" && (
                    <div className="flex items-center gap-1 justify-center w-full px-4">
                      <div className="w-1 bg-emerald-500 rounded-full animate-pulse h-6" />
                      <div className="w-1 bg-emerald-400 rounded-full animate-pulse h-10 delay-75" />
                      <div className="w-1 bg-emerald-500 rounded-full animate-pulse h-4 delay-150" />
                      <div className="w-1 bg-emerald-600 rounded-full animate-pulse h-12 delay-100" />
                      <div className="w-1 bg-emerald-400 rounded-full animate-pulse h-7 delay-200" />
                    </div>
                  )}

                  {screen.visualType === "languages" && (
                    <div className="flex gap-1 items-center justify-center">
                      <span className="text-xs">🇬🇧</span>
                      <span className="text-xs">🇩🇪</span>
                      <span className="text-xs">🇮🇳</span>
                      <span className="text-xs">🇫🇷</span>
                      <span className="text-xs">🇪🇸</span>
                    </div>
                  )}

                  {screen.visualType === "video" && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-2xl text-indigo-400">✦</span>
                      <span className="text-[9px] font-mono text-indigo-300">GEMINI CUT</span>
                    </div>
                  )}

                  {screen.visualType === "banner" && (
                    <div className="w-full h-full flex flex-col justify-between p-1">
                      <div className="w-full bg-indigo-500/10 border border-indigo-500/20 text-[8px] text-center text-indigo-300 py-0.5 rounded">
                        PROMO SPONSOR
                      </div>
                      <div className="flex justify-center items-center flex-1">
                        <span className="text-lg">📺</span>
                      </div>
                    </div>
                  )}

                  {screen.visualType === "portrait" && (
                    <div className="h-full aspect-[9/16] bg-slate-950 border border-slate-700/60 rounded flex items-center justify-center text-[10px] text-slate-500 font-mono">
                      9:16
                    </div>
                  )}

                  {screen.visualType === "landscape" && (
                    <div className="w-full aspect-[16/9] bg-slate-950 border border-slate-700/60 rounded flex items-center justify-center text-[10px] text-slate-500 font-mono">
                      16:9
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                    {screen.title}
                  </h3>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {screen.description}
                  </p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
