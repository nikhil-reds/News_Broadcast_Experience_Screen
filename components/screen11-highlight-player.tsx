"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import RecordingLooper from "@/components/recording-looper";

const BOAT_AD_IMAGE = "/ads/Boat%20L%20band.png";
const BLINKIT_AD_IMAGE = "/ads/Blink%20it%20L%20band.jpg.jpeg";
const L_BAND_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "19.4%", left: "13.5%" };
const FULL_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "0%", left: "0%" };

type PlayoutScene = {
  id: string;
  durationMs: number;
  image?: string;
  alt?: string;
};

// Begin with the full programme video, then switch to the same L-band ads used on Screen 12.
const PLAYOUT_SEQUENCE: readonly PlayoutScene[] = [
  { id: "full-1", durationMs: 6_000 },
  { id: "boat", durationMs: 8_000, image: BOAT_AD_IMAGE, alt: "boAt Rockerz Prime 415 advertisement" },
  { id: "full-2", durationMs: 6_000 },
  { id: "blinkit", durationMs: 8_000, image: BLINKIT_AD_IMAGE, alt: "Blinkit groceries delivery advertisement" },
];

/** Screen 11: starts full-screen, then alternates full programme video and Screen 12 L-band ads. */
export default function Screen11HighlightPlayer() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = PLAYOUT_SEQUENCE[sceneIndex];
  const isLBand = Boolean(scene.image);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSceneIndex((current) => (current + 1) % PLAYOUT_SEQUENCE.length),
      scene.durationMs,
    );

    return () => window.clearTimeout(timer);
  }, [scene.durationMs]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black font-sans text-slate-100">
      {scene.image && (
        <div className="absolute inset-0 z-0 animate-in fade-in duration-700">
          <Image src={scene.image} alt={scene.alt ?? "Sponsored advertisement"} fill className="object-fill" priority />
        </div>
      )}

      <section
        className="absolute z-10 overflow-hidden bg-black transition-all duration-700 ease-in-out"
        style={isLBand ? L_BAND_VIDEO_BOUNDS : FULL_VIDEO_BOUNDS}
      >
        <RecordingLooper
          source={{ highlight: true }}
          muted
          compositeBackgroundId="newsroom-blue"
          containerClassName="h-full w-full bg-black"
        />
      </section>
    </div>
  );
}
