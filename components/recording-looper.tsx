"use client";

import React, { useEffect, useState } from "react";
import type { CameraId } from "@/lib/camera-recordings";

interface RecordingItem {
  filename: string;
  url: string;
}

/**
 * Full-bleed loop of the newest take from one camera. Each screen pins its own
 * camera, so Screen 01 and Screen 02 never show each other's footage.
 */
export default function RecordingLooper({ cameraId }: { cameraId: CameraId }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLatestRecording = async () => {
      try {
        const res = await fetch(`/api/save-recording?camera=${cameraId}`);
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
  }, [cameraId]);

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
