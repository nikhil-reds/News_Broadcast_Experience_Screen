"use client";

import React, { useState, useEffect } from "react";

interface RecordingItem {
  filename: string;
  url: string;
}

export default function Screen1Page() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestRecording();
    const interval = setInterval(fetchLatestRecording, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchLatestRecording = async () => {
    try {
      const res = await fetch("/api/save-recording");
      if (res.ok) {
        const data = await res.json();
        const list: RecordingItem[] = data.recordings || [];
        if (list.length > 0) {
          setVideoUrl(list[0].url);
        }
      }
    } catch (err) {
      console.error("Error fetching recording:", err);
    }
  };

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
