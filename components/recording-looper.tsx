"use client";

import React, { useEffect, useRef, useState } from "react";
import { recordingSourceQuery, type RecordingSource } from "@/lib/camera-recordings";

interface RecordingItem {
  filename: string;
  url: string;
}

/**
 * Loop of the newest video from one source. Each screen pins its own:
 * Screen 01 and 02 take a camera each, Screen 06 takes the Gemini reel.
 *
 * `muted` defaults to true (Screens 01-03 are silent camera monitors); Screen
 * 06 passes `muted={false}` since the reel carries real audio (camera 1's
 * mic during its segments, silence grafted in for camera 2/3 segments — see
 * extractNormalizedClip) that's worth hearing.
 *
 * `frame` defaults to full-bleed (fills the browser viewport). Screen 11
 * passes a mobile-sized box instead — a portrait phone preview centered on
 * the page rather than a full-screen kiosk display.
 */
export default function RecordingLooper({
  source,
  muted = true,
  frame,
}: {
  source: RecordingSource;
  muted?: boolean;
  frame?: { width: number; height: number };
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const query = recordingSourceQuery(source);

  useEffect(() => {
    let cancelled = false;

    const fetchLatestRecording = async () => {
      try {
        const res = await fetch(`/api/save-recording?${query}`);
        if (res.ok) {
          const data = await res.json();
          const list: RecordingItem[] = data.recordings || [];
          if (list.length > 0 && !cancelled) {
            setVideoUrl(list[0].url);
          }
        }
      } catch (err) {
        console.error("Error fetching recording:", err);
      }
    };

    fetchLatestRecording();
    const interval = setInterval(fetchLatestRecording, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [query]);

  // Unmuted autoplay can be blocked by the browser without a prior user
  // gesture — the native `autoPlay` attribute fails silently in that case
  // (no error event), so detect it via the play() promise instead, same
  // pattern Screens 04/05 use for their <audio> elements.
  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    videoRef.current
      .play()
      .then(() => setSoundBlocked(false))
      .catch(() => {
        if (!muted) setSoundBlocked(true);
      });
  }, [videoUrl, muted]);

  const outerClass = frame
    ? "min-h-screen w-full flex items-center justify-center bg-slate-950"
    : "w-screen h-screen bg-black";

  if (!videoUrl) {
    return <div className={outerClass} />;
  }

  const retrySoundOnClick = () => {
    if (!soundBlocked) return;
    videoRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => {});
  };

  const boxClass = frame
    ? "overflow-hidden m-0 p-0 relative rounded-3xl"
    : "w-screen h-screen overflow-hidden m-0 p-0 relative";
  const boxStyle = frame ? { width: frame.width, height: frame.height } : undefined;

  return (
    <div className={outerClass}>
      <div className={`${boxClass} bg-black`} style={boxStyle} onClick={retrySoundOnClick}>
        <video
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          loop
          muted={muted}
          playsInline
          className="w-full h-full object-cover"
        />
        {soundBlocked && (
          <div className="absolute bottom-6 right-6 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-700 text-xs font-mono text-slate-200">
            🔇 Click to enable sound
          </div>
        )}
      </div>
    </div>
  );
}
