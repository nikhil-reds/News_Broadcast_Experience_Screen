"use client";

import React, { useState, useEffect, useRef } from "react";
import { composedOutputUrl } from "@/lib/green-screen";

const REEL_POLL_MS = 3000;
const BOTTOM_AD_IMAGE = "/ads/best/juice.png";

interface TimedCue {
  start: number;
  end: number;
  text: string;
}

export default function Screen10Page() {
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelFilename, setReelFilename] = useState<string | null>(null);
  const [englishAudioUrl, setEnglishAudioUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<TimedCue[]>([]);
  const [videoTime, setVideoTime] = useState(0);
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
          setReelFilename(list[0].filename);
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/save-audio")
      .then((res) => (res.ok ? res.json() : { audioFiles: [] }))
      .then((data) => {
        const original = (data.audioFiles as { filename: string; url: string }[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (!cancelled) setEnglishAudioUrl(original?.url ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!reelFilename || !englishAudioUrl) return;
    let cancelled = false;
    fetch(
      `/api/subtitle-cues?reelFilename=${encodeURIComponent(reelFilename)}` +
        `&sourceAudio=${encodeURIComponent(englishAudioUrl)}&language=English`
    )
      .then((res) => (res.ok ? res.json() : { cues: [] }))
      .then((data) => {
        if (!cancelled) setCues(Array.isArray(data.cues) ? data.cues : []);
      })
      .catch(() => {
        if (!cancelled) setCues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [englishAudioUrl, reelFilename]);

  const enableAudio = () => {
    videoRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  };

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100"
      style={{ gridTemplateRows: "70% 30%" }}
    >
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
                ref={videoRef}
                src={reelUrl}
                autoPlay
                loop
                playsInline
                onTimeUpdate={() => setVideoTime(videoRef.current?.currentTime ?? 0)}
                onLoadedData={() => {
                  videoRef.current
                    ?.play()
                    .then(() => setSoundBlocked(false))
                    .catch(() => setSoundBlocked(true));
                }}
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
            {cues.find((cue) => videoTime >= cue.start && videoTime <= cue.end) && (
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex justify-center">
                <p className="max-w-[90%] rounded-lg bg-black/70 px-4 py-2 text-center text-xl font-extrabold leading-snug text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
                  {cues.find((cue) => videoTime >= cue.start && videoTime <= cue.end)?.text}
                </p>
              </div>
            )}
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
                🔊 Click video to enable synchronized audio
              </div>
            )}
      </section>

      <aside className="relative min-h-0 overflow-hidden border-t border-white/20 bg-white">
        {/* Native image keeps the public asset visible in the short responsive rail. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          role="img"
          aria-label="Real Fruit Power advertisement"
          src={BOTTOM_AD_IMAGE}
          alt="Real Fruit Power advertisement"
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "cover", objectPosition: "bottom" }}
        />
      </aside>
    </div>
  );
}
