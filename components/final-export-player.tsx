"use client";

import { useEffect, useRef, useState } from "react";
import { useAdRotation } from "@/lib/use-ad-rotation";
import { useFinalExport } from "@/lib/use-final-export";
import AdBannerOverlay from "@/components/ad-banner-overlay";
import type { ExportAspect } from "@/lib/video-export";

/**
 * Screen 11/12's final preview: the actual composite export (background
 * swap + burned-in subtitles + original audio, from /api/video-export) with
 * the sponsored-ad banner layered on top as a CSS overlay — same choice
 * Screens 09/10 already make for their ad banner, so a real broadcast-out
 * doesn't need a second ffmpeg pass just to change which campaign is live.
 *
 * `frame`: Screen 11 passes a phone-sized box (portrait device preview);
 * Screen 12 omits it for a full-bleed landscape kiosk display.
 */
export default function FinalExportPlayer({
  aspect,
  frame,
  adPosition = "bottom",
}: {
  aspect: ExportAspect;
  frame?: { width: number; height: number };
  adPosition?: "bottom" | "left";
}) {
  const { videoUrl, status, error } = useFinalExport(aspect);
  const { activeAd } = useAdRotation();

  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    videoRef.current
      .play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  }, [videoUrl]);

  const outerClass = frame
    ? "min-h-screen w-full flex items-center justify-center bg-slate-950"
    : "w-screen h-screen bg-black";
  const boxClass = frame
    ? "overflow-hidden m-0 p-0 relative rounded-3xl bg-black"
    : "w-screen h-screen overflow-hidden m-0 p-0 relative bg-black";
  const boxStyle = frame ? { width: frame.width, height: frame.height } : undefined;

  const retrySound = () => {
    if (!soundBlocked) return;
    videoRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => {});
  };

  return (
    <div className={outerClass}>
      <div className={boxClass} style={boxStyle} onClick={retrySound}>
        {videoUrl ? (
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            autoPlay
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center px-6 text-slate-500 text-sm font-mono">
            {status === "failed"
              ? error || "Export failed — check `npm run worker:video-export` logs"
              : status === "processing"
                ? "Rendering final export…"
                : status === "queued"
                  ? "Export queued…"
                  : "Waiting for a highlight reel…"}
          </div>
        )}

        {videoUrl && activeAd && <AdBannerOverlay activeAd={activeAd} position={adPosition} />}

        {soundBlocked && (
          <div className="absolute bottom-6 right-6 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-700 text-xs font-mono text-slate-200 z-30">
            🔇 Click to enable sound
          </div>
        )}
      </div>
    </div>
  );
}
