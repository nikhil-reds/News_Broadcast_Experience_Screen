"use client";

import React, { useEffect, useState } from "react";
import { recordingSourceQuery, type RecordingSource } from "@/lib/camera-recordings";

interface RecordingItem {
  filename: string;
  url: string;
}

/**
 * Full-bleed loop of the newest video from one source. Each screen pins its
 * own: Screen 01 and 02 take a camera each, Screen 06 takes the Gemini reel.
 */
export default function RecordingLooper({ source }: { source: RecordingSource }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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

  if (!videoUrl) {
    return <div className="w-screen h-screen bg-black" />;
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden m-0 p-0">
      <video
        key={videoUrl}
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
      />
    </div>
  );
}
