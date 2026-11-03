"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RecordingLooper from "@/components/recording-looper";
import Image from "next/image";
import { useSelectedBackground } from "@/lib/use-selected-background";
import { useSelectedBrightness } from "@/lib/use-selected-brightness";
import { useSelectedSubtitleLanguage } from "@/lib/use-selected-subtitle-language";
import { AD_INDUSTRIES, getAdsByBrandId } from "@/lib/ad-catalog";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useSelectedAudio } from "@/lib/use-selected-audio";

const L_BAND_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "19.4%", left: "13.5%" };
const FULL_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "0%", left: "0%" };

type PlayoutScene = {
  id: string;
  durationMs: number;
  image?: string;
  alt?: string;
};

function buildPlayoutSequence(brandId: string): readonly PlayoutScene[] {
  const brandAds = getAdsByBrandId(brandId);
  // Most campaigns include an L-band creative designed for Screen 12. A
  // campaign such as Tropicana has only a composite creative, however; never
  // replace a valid selected brand with an unrelated/default advertisement.
  const ads = brandAds.filter((ad) => ad.id.endsWith("-l-band"));
  const selectedBrandAds = ads.length > 0 ? ads : brandAds;
  if (!selectedBrandAds.length) return [{ id: "full-only", durationMs: 6_000 }];
  return selectedBrandAds.flatMap((ad) => [
    { id: ad.id, durationMs: 8_000, image: ad.image, alt: ad.alt },
    { id: `${ad.id}-programme`, durationMs: 6_000 },
  ]);
}

/** Screen 12: rotates two L-band advertisements with full-screen programme intervals. */
export default function Screen12HighlightPlayer() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [brandId, setBrandId] = useState(AD_INDUSTRIES[0].brands[0].id);
  const backgroundId = useSelectedBackground();
  const brightness = useSelectedBrightness();
  const subtitleLanguage = useSelectedSubtitleLanguage();
  const audio = useSelectedAudio();
  const playoutSequence = useMemo(() => buildPlayoutSequence(brandId), [brandId]);
  const scene = playoutSequence[sceneIndex] ?? playoutSequence[0];
  const isLBand = Boolean(scene.image);
  const onRemoteBrand = useCallback((value: string) => {
    if (!getAdsByBrandId(value).length) return;
    setBrandId((current) => {
      if (current !== value) setSceneIndex(0);
      return value;
    });
  }, []);
  useRealtimeSelection("brand", onRemoteBrand);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSceneIndex((current) => (current + 1) % playoutSequence.length),
      scene.durationMs,
    );
    return () => window.clearTimeout(timer);
  }, [playoutSequence.length, scene.durationMs]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-slate-100">
      {scene.image && (
        <div key={`${brandId}:${scene.id}`} className="absolute inset-0 z-0 animate-in fade-in duration-700">
          <Image src={scene.image} alt={scene.alt ?? "Sponsored advertisement"} fill className="object-fill" priority />
        </div>
      )}

      <section
        className="absolute z-10 overflow-hidden bg-black transition-all duration-700 ease-in-out"
        style={isLBand ? L_BAND_VIDEO_BOUNDS : FULL_VIDEO_BOUNDS}
      >
        <RecordingLooper
          source={{ highlight: true }}
          // English uses the reel's continuous embedded master track. A
          // translated selection replaces it with exactly one separate dub.
          muted={audio.language !== "en"}
          originalAudio={audio.language !== "en"}
          englishSubtitles
          subtitleLanguage={subtitleLanguage}
          brightness={brightness}
          compositeBackgroundId={backgroundId}
          audioLanguage={audio.language}
          voiceId={audio.voiceId}
          containerClassName="h-full w-full bg-black"
        />
      </section>
      <aside className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-right text-xs shadow-lg backdrop-blur-sm">
        <p>Brand · {brandId}</p>
        <p>Audio · {audio.language === "en" ? "English original" : `${audio.language.toUpperCase()} · ${audio.voiceId}`}</p>
        <p>Brightness · {brightness}%</p>
        <p>Subtitles · {subtitleLanguage}</p>
      </aside>
    </div>
  );
}
